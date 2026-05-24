import { handleRunBash } from './handlers/bash.js';
import { handleReadFile, handleWriteFile, handleEditFile } from './handlers/file-ops.js';
import { handleGlobFiles, handleGrepSearch } from './handlers/search.js';
import { handleWebSearch, handleWebFetch } from './handlers/web.js';
import {
  handleTaskCreate, handleTaskGet, handleTaskList,
  handleTaskUpdate, handleTaskOutput, handleTaskStop,
} from './handlers/tasks.js';
import { handleCronCreate, handleCronDelete, handleCronList } from './handlers/cron.js';
import { handleAgentSpawn, handleAgentList, handleAgentGet, handleAgentStop, handleTeamSpawn, handleAgentReport, handleAgentReportAll, handleTeamMessage } from './handlers/agents.js';
import { handleConceptual } from './handlers/conceptual.js';

const HANDLERS = {
  run_bash: handleRunBash,
  read_file: handleReadFile,
  write_file: handleWriteFile,
  edit_file: handleEditFile,
  glob_files: handleGlobFiles,
  grep_search: handleGrepSearch,
  web_search: handleWebSearch,
  web_fetch: handleWebFetch,
  task_create: handleTaskCreate,
  task_get: handleTaskGet,
  task_list: handleTaskList,
  task_update: handleTaskUpdate,
  task_output: handleTaskOutput,
  task_stop: handleTaskStop,
  cron_create: handleCronCreate,
  cron_delete: handleCronDelete,
  cron_list: handleCronList,
  agent_spawn: handleAgentSpawn,
  agent_list: handleAgentList,
  agent_get: handleAgentGet,
  agent_stop: handleAgentStop,
  team_spawn: handleTeamSpawn,
  agent_report: handleAgentReport,
  agent_report_all: handleAgentReportAll,
  team_message: handleTeamMessage,

  ask_user_question: handleConceptual,
  enter_plan_mode: handleConceptual,
  exit_plan_mode: handleConceptual,
  enter_worktree: handleConceptual,
  exit_worktree: handleConceptual,
  monitor_process: handleConceptual,
  notebook_edit: handleConceptual,
  invoke_skill: handleConceptual,
};

export const executeToolCall = async (toolName, toolArgs, context = {}) => {
  const handler = HANDLERS[toolName];
  if (!handler) {
    return { type: 'error', message: `Unknown tool "${toolName}".` };
  }
  try {
    const result = await handler(toolArgs || {}, toolName, context);
    // Pass through structured objects, wrap plain strings
    if (typeof result === 'object' && result !== null && result.type) {
      return result;
    }
    return { type: 'generic', message: String(result) };
  } catch (err) {
    return { type: 'error', message: `Error executing ${toolName}: ${err.message}` };
  }
};

