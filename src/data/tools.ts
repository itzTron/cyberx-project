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
    slug: 'secure-communication',
    name: 'Secure Communication Tool',
    shortDescription: 'End-to-end encrypted messaging and file transfer',
    description: 'Secure communication platform featuring RSA + AES end-to-end encryption, secure file transfer, self-destructing messages, and Diffie-Hellman key exchange for maximum privacy.',
    icon: MessageSquareLock,
    category: 'Communication',
    priority: 'High',
    complexity: 'Advanced',
    impact: 'Essential for confidential communications',
    features: [
      'RSA + AES Encryption',
      'Secure File Transfer',
      'Self-Destructing Messages',
      'Diffie-Hellman Key Exchange',
      'Forward Secrecy',
      'Message Verification'
    ],
    futureEnhancements: [
      'Voice/video encryption',
      'Multi-device sync',
      'Group messaging support'
    ]
  },
  {
    slug: 'malware-analyzer',
    name: 'Malware Analyzer',
    shortDescription: 'Static and behavioral malware analysis with YARA rules',
    description: 'Comprehensive malware analysis tool supporting static analysis, hash checking with VirusTotal integration, behavioral analysis in sandboxed environments, and YARA rules for pattern matching.',
    icon: Bug,
    category: 'Threat Analysis',
    priority: 'High',
    complexity: 'Expert',
    impact: 'Critical for threat investigation',
    features: [
      'Static Analysis',
      'VirusTotal Integration',
      'Behavioral Analysis',
      'YARA Rules Support',
      'PE/ELF Parsing',
      'String Extraction'
    ],
    futureEnhancements: [
      'Dynamic sandbox environment',
      'ML-based classification',
      'Automated report generation'
    ]
  },
  {
    slug: 'two-factor-auth-manager',
    name: 'Two-Factor Authentication Manager',
    shortDescription: 'TOTP/HOTP generator with backup code support',
    description: 'Secure two-factor authentication manager supporting TOTP and HOTP protocols, backup code generation, QR code scanning, and hardware key integration for enhanced account security.',
    icon: KeyRound,
    category: 'Authentication',
    priority: 'Medium',
    complexity: 'Intermediate',
    impact: 'Important for account security',
    features: [
      'TOTP Generator',
      'HOTP Support',
      'Backup Codes',
      'QR Code Generator',
      'Hardware Key Integration',
      'Encrypted Storage'
    ],
    futureEnhancements: [
      'Biometric authentication',
      'Cloud backup option',
      'Browser extension'
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
    slug: 'dark-web-monitor',
    name: 'Dark Web Monitor',
    shortDescription: 'Monitor credentials and data breaches on the dark web',
    description: 'Dark web monitoring solution for credential monitoring, data breach alerts, Tor network integration, and HaveIBeenPwned API hooks to protect your identity and sensitive data.',
    icon: Globe,
    category: 'Threat Intelligence',
    priority: 'High',
    complexity: 'Advanced',
    impact: 'Critical for identity protection',
    features: [
      'Credential Monitoring',
      'Data Breach Alerts',
      'Tor Integration',
      'HaveIBeenPwned API',
      'Real-time Notifications',
      'Historical Analysis'
    ],
    futureEnhancements: [
      'Brand monitoring',
      'Automated takedown requests',
      'Threat actor tracking'
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
