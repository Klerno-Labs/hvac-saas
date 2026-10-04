export function recommendPlan(
  teamAccess: boolean,
  collections: boolean,
): "starter" | "pro" {
  return teamAccess || collections ? "pro" : "starter";
}
export function estimateAdminTime(
  jobsPerWeek: number,
  currentMinutes: number,
  targetMinutes: number,
) {
  if (
    ![jobsPerWeek, currentMinutes, targetMinutes].every(Number.isFinite) ||
    jobsPerWeek < 0 ||
    jobsPerWeek > 1000 ||
    !Number.isInteger(jobsPerWeek) ||
    currentMinutes < 0 ||
    currentMinutes > 240 ||
    targetMinutes < 0 ||
    targetMinutes > 240
  )
    return null;
  const hoursPerMonth = (jobsPerWeek * currentMinutes * (52 / 12)) / 60;
  const targetHoursPerMonth = (jobsPerWeek * targetMinutes * (52 / 12)) / 60;
  return {
    hoursPerMonth,
    targetHoursPerMonth,
    changeHoursPerMonth: hoursPerMonth - targetHoursPerMonth,
  };
}
