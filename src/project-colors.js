export function projectColor(project) {
  return /^#[\da-f]{6}$/i.test(project?.color || '') ? project.color : '#89b4ff';
}
export function projectDot(project) {
  return `<span class="project-color-dot" aria-hidden="true" style="--project-color:${projectColor(project)}"></span>`;
}
