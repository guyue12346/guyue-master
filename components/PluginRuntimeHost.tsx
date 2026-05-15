import React, { useMemo } from 'react';
import type { PluginMetadata } from '../types';
import { PluginContainer } from './PluginContainer';

interface PluginRuntimeHostProps {
  plugins: PluginMetadata[];
}

export const PluginRuntimeHost: React.FC<PluginRuntimeHostProps> = ({ plugins }) => {
  const runnablePlugins = useMemo(
    () => plugins.filter(plugin => Boolean(plugin.id && plugin.entryPath)),
    [plugins],
  );

  if (runnablePlugins.length === 0) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed -left-[10000px] top-0 h-px w-px overflow-hidden opacity-0">
      {runnablePlugins.map(plugin => (
        <PluginContainer
          key={plugin.id}
          entryPath={plugin.entryPath || ''}
          pluginId={plugin.id}
          pluginName={plugin.name}
          runtimeMode="background"
          hidden
        />
      ))}
    </div>
  );
};
