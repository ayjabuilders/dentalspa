import { describe, expect, it } from 'vitest';
import { visibleWorkspaceNavigation } from '../../apps/clinic-os/lib/development-tools';

describe('workspace navigation release filtering', () => {
  const items = ['home', 'patients', 'planning', 'clinical', 'business', 'team', 'playbook', 'build'].map(id => ({ id }));
  it('keeps business modules while removing internal tools on hosted builds', () => {
    expect(visibleWorkspaceNavigation(items, false).map(item => item.id)).toEqual(['home', 'patients', 'planning', 'clinical', 'business', 'team']);
    expect(items).toHaveLength(8);
  });
  it('preserves all development navigation locally', () => {
    expect(visibleWorkspaceNavigation(items, true)).toEqual(items);
  });
});
