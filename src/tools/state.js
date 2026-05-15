// In-memory stores for background tasks and cron jobs
// Singleton module-level objects shared across all handler imports

export const tasks = new Map();
let taskCounter = 0;
export const nextTaskId = () => `task_${++taskCounter}`;

export const cronJobs = new Map();
let cronCounter = 0;
export const nextCronId = () => `cron_${++cronCounter}`;
