const RESPONSES = {
  ask_user_question:
    'This tool cannot intercept user input mid-conversation. Include your question in the assistant response text and wait for the user\'s next message.',
  enter_plan_mode:
    'Plan mode activated. Think step-by-step about the task before executing.',
  exit_plan_mode:
    'Plan mode deactivated. Proceeding with execution.',
  enter_worktree:
    'Git worktree isolation is not supported in this environment.',
  exit_worktree:
    'No active worktree to exit.',
  notebook_edit:
    'Jupyter notebook editing is not yet implemented. Use read_file and edit_file to modify .ipynb files as raw JSON.',
  invoke_skill:
    'Skill invocation is not yet implemented. Perform the task directly using available tools.',
};

export async function handleConceptual(args, toolName) {
  if (toolName === 'monitor_process') {
    // Delegate to task_output if a task_id is provided
    const { task_id } = args || {};
    if (task_id) {
      const { handleTaskOutput } = await import('./tasks.js');
      return handleTaskOutput(args);
    }
    return 'Use task_output with a task_id to monitor a background process.';
  }
  return RESPONSES[toolName] || `Tool ${toolName} is not yet implemented.`;
}
