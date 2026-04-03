import { Image, Radar, Shield } from 'lucide-react';

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
  icon: typeof Radar;
  category: string;
  priority: 'High' | 'Medium' | 'Low';
  complexity: string;
  impact: string;
  features: string[];
  futureEnhancements: string[];
  downloads: ToolDownloadMeta;
}

export const tools: Tool[] = [
  {
    slug: 'cyberx',
    name: 'CyberX',
    shortDescription: 'Unified toolkit for scanning, analysis, encryption, and incident workflows',
    description:
      'CyberX is the core multi-tool security package for Cyberspace-X 2.0, combining network checks, threat analysis, encryption helpers, and operational workflow utilities in one CLI-first toolkit.',
    icon: Shield,
    category: 'Security Suite',
    priority: 'High',
    complexity: 'Advanced',
    impact: 'Primary toolkit for day-to-day security operations',
    features: [
      'Multi-tool CLI workflow',
      'Security automation helpers',
      'Report-friendly output formats',
      'Encryption and integrity helpers',
      'Modular command architecture',
    ],
    futureEnhancements: [
      'Plugin marketplace support',
      'Automated threat response recipes',
      'Cross-platform desktop launcher',
    ],
    downloads: {
      cliInstallCommand: 'pip install cyberx-toolkit',
      cliRunCommand: 'cyberx --help',
      githubRepoUrl: 'https://github.com/itzTron/CyberX',
      zipDownloadUrl: '/downloads/cyberx-latest.zip',
    },
  },
  {
    slug: 'network-security-scanner',
    name: 'Network Security Scanner',
    shortDescription: 'Host discovery, port intelligence, and vulnerability-focused network mapping',
    description:
      'Network Security Scanner maps reachable hosts, fingerprints exposed services, and highlights vulnerable surfaces so teams can prioritize patching and hardening across internal and external assets.',
    icon: Radar,
    category: 'Network Security',
    priority: 'High',
    complexity: 'Advanced',
    impact: 'Critical for attack-surface visibility',
    features: [
      'Host and port discovery',
      'Service fingerprinting',
      'Protocol-aware probing',
      'Vulnerability hint detection',
      'Scan report export',
    ],
    futureEnhancements: [
      'Scheduled scan automation',
      'Delta scan comparisons',
      'CMDB asset sync integrations',
    ],
    downloads: {
      cliInstallCommand: 'pip install network-security-scanner',
      cliRunCommand: 'nsscan --target 192.168.1.0/24',
      githubRepoUrl: 'https://github.com/itzTron/network-security-scanner',
      zipDownloadUrl: '/downloads/network-security-scanner-latest.zip',
    },
  },
  {
    slug: 'intrusion-detection-system',
    name: 'Intrusion Detection System',
    shortDescription: 'Continuous telemetry monitoring with anomaly and signature detection layers',
    description:
      'Intrusion Detection System monitors network activity in real time, correlates signature and behavior anomalies, and surfaces actionable alerts for suspicious lateral movement, beaconing, and policy violations.',
    icon: Shield,
    category: 'Threat Detection',
    priority: 'High',
    complexity: 'Advanced',
    impact: 'Essential for rapid detection and triage',
    features: [
      'Real-time packet and flow analysis',
      'Signature and anomaly detection',
      'Alert severity scoring',
      'SOC-ready event timelines',
      'Custom rule tuning',
    ],
    futureEnhancements: [
      'Built-in SOAR connectors',
      'Zero-day behavior model updates',
      'Threat intel feed correlation',
    ],
    downloads: {
      cliInstallCommand: 'pip install intrusion-detection-system',
      cliRunCommand: 'ids-monitor --interface eth0',
      githubRepoUrl: 'https://github.com/itzTron/intrusion-detection-system',
      zipDownloadUrl: '/downloads/intrusion-detection-system-latest.zip',
    },
  },
  {
    slug: 'steganography-tool',
    name: 'Steganography Tool',
    shortDescription: 'Conceal, extract, and validate hidden payloads in media files',
    description:
      'Steganography Tool supports secure payload hiding and extraction for images and audio, with integrity checks and optional encryption overlays to protect sensitive transfers in constrained environments.',
    icon: Image,
    category: 'Data Concealment',
    priority: 'Medium',
    complexity: 'Intermediate',
    impact: 'Useful for covert and tamper-aware data exchange',
    features: [
      'Image and audio payload embedding',
      'Secret extraction with validation',
      'Optional encrypted payload mode',
      'Capacity estimation checks',
      'Forensic detection aids',
    ],
    futureEnhancements: [
      'Video container support',
      'Batch pipeline mode',
      'Adaptive anti-detection strategy presets',
    ],
    downloads: {
      cliInstallCommand: 'pip install steganography-tool',
      cliRunCommand: 'stego hide --input image.png --secret secret.txt',
      githubRepoUrl: 'https://github.com/itzTron/steganography-tool',
      zipDownloadUrl: '/downloads/steganography-tool-latest.zip',
    },
  },
];

export const getToolBySlug = (slug: string): Tool | undefined => {
  return tools.find((tool) => tool.slug === slug);
};
