// Build-time presentation flag only; the server proxy independently denies hosted access.
export const developmentToolsVisible = process.env.NEXT_PUBLIC_DEVELOPMENT_TOOLS !== 'false';

export function visibleWorkspaceNavigation<T extends { id: string }>(items: T[], showDevelopment: boolean) {
  return showDevelopment ? items : items.filter(item => item.id !== 'build' && item.id !== 'playbook');
}
