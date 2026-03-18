import { 
  Radar, 
  Shield, 
  FileX2, 
  MessageSquareLock, 
  Bug, 
  KeyRound, 
  ClipboardCheck, 
  Image, 
  Globe, 
  HardDrive 
} from 'lucide-react';

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
}

export const tools: Tool[] = [
  {
    slug: 'cyberx-security-suite',
    name: 'CyberX Security Suite',
    shortDescription: 'Comprehensive security toolkit with encryption, tracking, and password management',
    description: 'The complete CyberX security suite featuring advanced encryption, access tracking, integrity verification, password vault, and self-contained local storage for maximum security and privacy.',
    icon: Shield,
    category: 'Security Suite',
    priority: 'High',
    complexity: 'Advanced',
    impact: 'Essential for comprehensive security protection',
    features: [
      'AES-256 Encryption',
      'Access Tracking',
      'Integrity Checks',
      'Password Vault',
      'Self-Contained'
    ],
    futureEnhancements: [
      'Multi-platform support',
      'Cloud backup integration',
      'Advanced threat detection'
    ]
  },
  {
    slug: 'network-security-scanner',
    name: 'Network Security Scanner',
    shortDescription: 'Comprehensive network analysis and vulnerability detection',
    description: 'A powerful network analysis tool that performs port scanning, vulnerability detection, service fingerprinting, and network mapping to identify potential security weaknesses in your infrastructure.',
    icon: Radar,
    category: 'Network Security',
    priority: 'High',
    complexity: 'Advanced',
    impact: 'Critical for identifying network vulnerabilities',
    features: [
      'Port Scanner',
      'Vulnerability Detection',
      'Service Fingerprinting',
      'Network Mapping',
      'Banner Grabbing',
      'OS Detection'
    ],
    futureEnhancements: [
      'Real-time scanning dashboard',
      'Automated remediation suggestions',
      'Integration with SIEM systems'
    ]
  },
  {
    slug: 'intrusion-detection-system',
    name: 'Intrusion Detection System',
    shortDescription: 'Real-time monitoring with ML-based anomaly detection',
    description: 'Advanced intrusion detection system featuring real-time network monitoring, machine learning-based anomaly detection, customizable alert systems, and honeypot integration for comprehensive threat detection.',
    icon: Shield,
    category: 'Threat Detection',
    priority: 'High',
    complexity: 'Advanced',
    impact: 'Essential for real-time threat monitoring',
    features: [
      'Real-time Monitoring',
      'ML-based Anomaly Detection',
      'Email/SMS Alerts',
      'Honeypot Integration',
      'Traffic Analysis',
      'Pattern Recognition'
    ],
    futureEnhancements: [
      'Deep learning models for zero-day detection',
      'Automated incident response',
      'Cloud-based threat intelligence'
    ]
  },
  {
    slug: 'secure-file-shredder',
    name: 'Secure File Shredder',
    shortDescription: 'Military-grade file deletion with multiple methods',
    description: 'Securely delete sensitive files using military-grade algorithms including DoD 5220.22-M (7-pass) and Gutmann Method (35-pass), with additional features for free space wiping and scheduled shredding.',
    icon: FileX2,
    category: 'Data Security',
    priority: 'High',
    complexity: 'Intermediate',
    impact: 'Critical for data privacy compliance',
    features: [
      'DoD 5220.22-M (7-pass)',
      'Gutmann Method (35-pass)',
      'Free Space Wiping',
      'Scheduled Shredding',
      'Verification Reports',
      'Batch Processing'
    ],
    futureEnhancements: [
      'SSD-optimized secure deletion',
      'Cloud storage integration',
      'Compliance reporting'
    ]
  },
  {
    slug: 'security-audit-reporting',
    name: 'Security Audit & Reporting',
    shortDescription: 'Compliance checks and automated security reports',
    description: 'Comprehensive security auditing tool that performs system audits, compliance checks for GDPR, HIPAA, and PCI-DSS standards, generates PDF reports, and provides risk scoring.',
    icon: ClipboardCheck,
    category: 'Compliance',
    priority: 'High',
    complexity: 'Intermediate',
    impact: 'Essential for regulatory compliance',
    features: [
      'System Audit',
      'GDPR Compliance',
      'HIPAA Compliance',
      'PCI-DSS Compliance',
      'PDF Report Generation',
      'Risk Scoring'
    ],
    futureEnhancements: [
      'Continuous monitoring',
      'Custom compliance frameworks',
      'Integration with ticketing systems'
    ]
  },
  {
    slug: 'steganography-tool',
    name: 'Steganography Tool',
    shortDescription: 'Hide and detect data in images and audio files',
    description: 'Advanced steganography tool for hiding data within images and audio files, detecting hidden content, and combining encryption with steganography for maximum security.',
    icon: Image,
    category: 'Data Concealment',
    priority: 'Medium',
    complexity: 'Intermediate',
    impact: 'Useful for covert data transfer',
    features: [
      'Image Steganography',
      'Audio Steganography',
      'Hidden Data Detection',
      'Encryption + Stego Combo',
      'Capacity Analysis',
      'Multiple Algorithms'
    ],
    futureEnhancements: [
      'Video steganography',
      'AI-based detection bypass',
      'Batch processing'
    ]
  },
  {
    slug: 'encrypted-backup-system',
    name: 'Encrypted Backup System',
    shortDescription: 'Secure incremental backups with cloud integration',
    description: 'Enterprise-grade encrypted backup system featuring incremental backups, cloud integration with AWS S3, Google Drive, and Dropbox, versioning, and deduplication for efficient storage.',
    icon: HardDrive,
    category: 'Data Protection',
    priority: 'High',
    complexity: 'Intermediate',
    impact: 'Essential for disaster recovery',
    features: [
      'Incremental Backups',
      'AWS S3 Integration',
      'Google Drive Integration',
      'Dropbox Integration',
      'Versioning',
      'Deduplication'
    ],
    futureEnhancements: [
      'Point-in-time recovery',
      'Ransomware protection',
      'Cross-region replication'
    ]
  }
];

export const getToolBySlug = (slug: string): Tool | undefined => {
  return tools.find(tool => tool.slug === slug);
};
