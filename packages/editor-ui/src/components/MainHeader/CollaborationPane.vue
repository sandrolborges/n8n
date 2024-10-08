<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed, watch } from 'vue';
import { useDocumentVisibility } from '@vueuse/core';

import { useUsersStore } from '@/stores/users.store';
import { useCollaborationStore } from '@/stores/collaboration.store';
import { isUserGlobalOwner } from '@/utils/userUtils';

const collaborationStore = useCollaborationStore();
const usersStore = useUsersStore();

const visibility = useDocumentVisibility();
watch(visibility, (visibilityState) => {
	if (visibilityState === 'hidden') {
		collaborationStore.stopHeartbeat();
	} else {
		collaborationStore.startHeartbeat();
	}
});

const showUserStack = computed(() => collaborationStore.collaborators.length > 1);

const collaboratorsSorted = computed(() => {
	const currentWorkflowUsers = collaborationStore.collaborators.map(({ user }) => user);
	const owner = currentWorkflowUsers.find(isUserGlobalOwner);
	return {
		defaultGroup: owner
			? [owner, ...currentWorkflowUsers.filter((user) => user.id !== owner.id)]
			: currentWorkflowUsers,
	};
});

const currentUserEmail = computed(() => usersStore.currentUser?.email);

onMounted(() => {
	collaborationStore.initialize();
});

onBeforeUnmount(() => {
	collaborationStore.terminate();
});
</script>

<template>
	<div
		:class="`collaboration-pane-container ${$style.container}`"
		data-test-id="collaboration-pane"
	>
		<n8n-user-stack
			v-if="showUserStack"
			:users="collaboratorsSorted"
			:current-user-email="currentUserEmail"
		/>
	</div>
</template>

<style lang="scss" module>
.container {
	margin: 0 var(--spacing-4xs);
}
</style>
