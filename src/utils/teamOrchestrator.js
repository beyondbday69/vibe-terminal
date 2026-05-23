import { TEAM_PRESETS } from '../constants.js';

export function parseTeamPreset(teamId, fallback = 'solo') {
  if (TEAM_PRESETS[teamId]) {
    return TEAM_PRESETS[teamId];
  }
  return TEAM_PRESETS[fallback] || [];
}

export function generateOrchestratorPrompt(task, team) {
  const roles = team.map(r => r.role).join(', ');
  return `You are the team orchestrator. Your task: ${task}\n\nYou have the following team members available: ${roles}.\nDelegate tasks appropriately using agent_spawn.`;
}
