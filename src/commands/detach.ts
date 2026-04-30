import { loadMachineConfig, saveMachineConfig } from '../core/machine';
import { deleteSyncState, loadSyncState } from '../core/state';

export async function runDetach(): Promise<void> {
  const state = await loadSyncState();
  if (Object.keys(state.records).length > 0) {
    throw new Error('当前仍有已托管项，请先执行 agent-profile remove --all');
  }

  const machine = await loadMachineConfig();
  await saveMachineConfig({
    version: machine.version ?? 1,
    activeRepo: null,
  });
  await deleteSyncState();
}
