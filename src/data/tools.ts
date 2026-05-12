import type React from 'react';

export interface ToolDownloadMeta {
  cliInstallCommand: string;
  cliRunCommand: string;
  githubRepoUrl: string;
  zipDownloadUrl: string;
}

export interface Tool {
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  category: string;
  priority: 'High' | 'Medium' | 'Low';
  complexity: string;
  impact: string;
  features: string[];
  futureEnhancements: string[];
  downloads: ToolDownloadMeta;
}

export const tools: Tool[] = [];

export const getToolBySlug = (slug: string): Tool | undefined =>
  tools.find((tool) => tool.slug === slug);
