// Builds the prompt every job session starts with. Each job is a fresh session
// (session rotation); context passes between jobs only through files in the repo.

export function jobBranch(config, job, attempt) {
  return `${config.state.jobBranchPrefix}${job.id}-a${attempt}`;
}

export function buildPrompt(config, job, attempt, { answers = [] } = {}) {
  const branch = jobBranch(config, job, attempt);
  const skillCall = `/${job.skill}${job.args ? ' ' + job.args : ''}`;
  const answersText = answers.length
    ? `\nAnswers from the owner since the last attempt (also logged in automation/decisions.md):\n${answers.map((a) => `- ${a.id}: ${a.question}\n  ANSWER: ${a.answer}`).join('\n')}\n`
    : '';

  const protocol = [
    `You are running pipeline job "${job.id}" (attempt ${attempt}): ${job.title}.`,
    `Follow the job protocol in CLAUDE.md and the stage instructions in .claude/skills/${job.skill}/SKILL.md${job.args ? ` with argument "${job.args}"` : ''}.`,
    `Read automation/handoffs/ for what earlier jobs left you, and automation/decisions.md for decisions already made.`,
    answersText,
    `When you finish, whatever the outcome:`,
    `1. Write automation/results/${job.id}.json  (fields: jobId "${job.id}", attempt ${attempt}, status "done" | "blocked" | "failed", summary, questions[], decisions[], and for the audit job also jobsAlreadyDone[] and jobsStale[]).`,
    `2. Write automation/handoffs/${job.id}.md for the next job.`,
    `3. Commit everything and push it to a new branch named exactly ${branch} (git checkout -b ${branch} && git push -u origin ${branch}). Do not push to the main branch.`,
    `4. Print the result JSON as your final message.`,
  ].join('\n');

  if (!job.goal) return `${skillCall}\n\n${protocol}`;

  const limit = config.claude.goalTurnLimit || 25;
  // /goal keeps the session working until a separate evaluator model agrees the condition holds.
  // "blocked" and "failed" are terminal too, so a stuck job ends with a question instead of looping.
  const goal = (body) => `/goal Job ${job.id} is finished: EITHER (${job.done}) and automation/results/${job.id}.json says status "done" and branch ${branch} is pushed; ` +
    `OR the job is blocked on a decision only the owner can make, recorded as status "blocked" with questions in that result file and the branch pushed; ` +
    `OR stop after ${limit} turns with status "failed" and the reason recorded. Work through it as follows:\n\n${body}`;

  let text = goal(protocol);
  if (text.length > GOAL_MAX) {
    // /goal conditions are capped at 4,000 characters: point at decisions.md instead of inlining answers.
    text = goal(protocol.replace(answersText, '\nThe owner answered your earlier questions: read them in automation/decisions.md first.\n'));
  }
  return text;
}

export const GOAL_MAX = 3900;
