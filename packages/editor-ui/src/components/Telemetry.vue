<template>
	<span v-show="false" />
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { mapStores } from 'pinia';
import { useRootStore } from '@/stores/n8nRoot.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useUsersStore } from '@/stores/users.store';
import type { ITelemetrySettings } from 'n8n-workflow';
import { useProjectsStore } from '@/stores/projects.store';

export default defineComponent({
	name: 'Telemetry',
	data() {
		return {
			isTelemetryInitialized: false,
		};
	},
	computed: {
		...mapStores(useRootStore, useSettingsStore, useUsersStore, useProjectsStore),
		currentUserId(): string {
			return this.usersStore.currentUserId ?? '';
		},
		isTelemetryEnabledOnRoute(): boolean {
			const routeMeta = this.$route.meta as { telemetry?: { disabled?: boolean } } | undefined;
			return routeMeta?.telemetry ? !routeMeta.telemetry.disabled : true;
		},
		telemetry(): ITelemetrySettings {
			return this.settingsStore.telemetry;
		},
		isTelemetryEnabled(): boolean {
			return !!this.telemetry?.enabled;
		},
	},
	watch: {
		telemetry() {
			this.init();
		},
		currentUserId(userId) {
			if (this.isTelemetryEnabled) {
				this.$telemetry.identify(this.rootStore.instanceId, userId);
			}
		},
		isTelemetryEnabledOnRoute(enabled) {
			if (enabled) {
				this.init();
			}
		},
	},
	mounted() {
		this.init();
	},
	methods: {
		init() {
			if (
				this.isTelemetryInitialized ||
				!this.isTelemetryEnabledOnRoute ||
				!this.isTelemetryEnabled
			)
				return;

			this.$telemetry.init(this.telemetry, {
				instanceId: this.rootStore.instanceId,
				userId: this.currentUserId,
				projectId: this.projectsStore.personalProject?.id,
				versionCli: this.rootStore.versionCli,
			});

			this.isTelemetryInitialized = true;
		},
	},
});
</script>
