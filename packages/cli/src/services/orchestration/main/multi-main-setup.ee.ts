import config from '@/config';
import { Service } from 'typedi';
import { TIME } from '@/constants';
import { InstanceSettings } from 'n8n-core';
import { ErrorReporterProxy as EventReporter } from 'n8n-workflow';
import { Logger } from '@/logger';
import { RedisServicePubSubPublisher } from '@/services/redis/redis-service-pub-sub-publisher';
import { RedisClientService } from '@/services/redis/redis-client.service';
import { TypedEmitter } from '@/typed-emitter';

type MultiMainEvents = {
	'leader-stepdown': never;
	'leader-takeover': never;
};

@Service()
export class MultiMainSetup extends TypedEmitter<MultiMainEvents> {
	constructor(
		private readonly logger: Logger,
		private readonly instanceSettings: InstanceSettings,
		private readonly redisPublisher: RedisServicePubSubPublisher,
		private readonly redisClientService: RedisClientService,
	) {
		super();
	}

	get instanceId() {
		return config.getEnv('redis.queueModeId');
	}

	private leaderKey: string;

	private readonly leaderKeyTtl = config.getEnv('multiMainSetup.ttl');

	private leaderCheckInterval: NodeJS.Timer | undefined;

	async init() {
		const prefix = config.getEnv('redis.prefix');
		const validPrefix = this.redisClientService.toValidPrefix(prefix);
		this.leaderKey = validPrefix + ':main_instance_leader';

		await this.tryBecomeLeader(); // prevent initial wait

		this.leaderCheckInterval = setInterval(
			async () => {
				await this.checkLeader();
			},
			config.getEnv('multiMainSetup.interval') * TIME.SECOND,
		);
	}

	async shutdown() {
		clearInterval(this.leaderCheckInterval);

		const { isLeader } = this.instanceSettings;

		if (isLeader) await this.redisPublisher.clear(this.leaderKey);
	}

	private async checkLeader() {
		const leaderId = await this.redisPublisher.get(this.leaderKey);

		if (leaderId === this.instanceId) {
			this.logger.debug(`[Instance ID ${this.instanceId}] Leader is this instance`);

			await this.redisPublisher.setExpiration(this.leaderKey, this.leaderKeyTtl);

			return;
		}

		if (leaderId && leaderId !== this.instanceId) {
			this.logger.debug(`[Instance ID ${this.instanceId}] Leader is other instance "${leaderId}"`);

			if (this.instanceSettings.isLeader) {
				this.instanceSettings.markAsFollower();

				this.emit('leader-stepdown'); // lost leadership - stop triggers, pollers, pruning, wait-tracking, queue recovery

				EventReporter.info('[Multi-main setup] Leader failed to renew leader key');
			}

			return;
		}

		if (!leaderId) {
			this.logger.debug(
				`[Instance ID ${this.instanceId}] Leadership vacant, attempting to become leader...`,
			);

			this.instanceSettings.markAsFollower();

			/**
			 * Lost leadership - stop triggers, pollers, pruning, wait tracking, license renewal, queue recovery
			 */
			this.emit('leader-stepdown');

			await this.tryBecomeLeader();
		}
	}

	private async tryBecomeLeader() {
		// this can only succeed if leadership is currently vacant
		const keySetSuccessfully = await this.redisPublisher.setIfNotExists(
			this.leaderKey,
			this.instanceId,
		);

		if (keySetSuccessfully) {
			this.logger.debug(`[Instance ID ${this.instanceId}] Leader is now this instance`);

			this.instanceSettings.markAsLeader();

			await this.redisPublisher.setExpiration(this.leaderKey, this.leaderKeyTtl);

			/**
			 * Gained leadership - start triggers, pollers, pruning, wait-tracking, license renewal, queue recovery
			 */
			this.emit('leader-takeover');
		} else {
			this.instanceSettings.markAsFollower();
		}
	}

	async fetchLeaderKey() {
		return await this.redisPublisher.get(this.leaderKey);
	}
}
