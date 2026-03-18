export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  status: 'Completed' | 'In Progress' | 'Planned';
  priority: 'High' | 'Medium' | 'Low';
  phase: 'Current Semester' | 'Next Phase' | 'Future';
}

export const roadmapItems: RoadmapItem[] = [
  {
    id: '1',
    title: 'Full-Fledged Website',
    description: 'Create a comprehensive website where everyone can download the software and access documentation.',
    status: 'In Progress',
    priority: 'High',
    phase: 'Current Semester'
  },
  {
    id: '2',
    title: 'CLI to GUI Conversion',
    description: 'Convert the software from command-line interface to a modern graphical user interface for better user experience.',
    status: 'In Progress',
    priority: 'High',
    phase: 'Current Semester'
  },
  {
    id: '3',
    title: 'Desktop Application Packaging',
    description: 'Package Python .py files into standalone desktop applications for Windows, macOS, and Linux.',
    status: 'In Progress',
    priority: 'High',
    phase: 'Current Semester'
  },
  {
    id: '4',
    title: 'Bug Fixes & Optimization',
    description: 'Address existing bugs, improve performance, and optimize code for better stability.',
    status: 'In Progress',
    priority: 'High',
    phase: 'Current Semester'
  },
  {
    id: '5',
    title: 'Advanced Analytics Dashboard',
    description: 'Build comprehensive analytics dashboards for monitoring and visualizing security metrics.',
    status: 'Planned',
    priority: 'Medium',
    phase: 'Next Phase'
  },
  {
    id: '6',
    title: 'Cloud Provider Integration',
    description: 'Deeper integration with major cloud providers (AWS, Azure, GCP) for enhanced functionality.',
    status: 'Planned',
    priority: 'Medium',
    phase: 'Next Phase'
  },
  {
    id: '7',
    title: 'Automated Incident Response',
    description: 'Implement automated response capabilities for detected security incidents.',
    status: 'Planned',
    priority: 'High',
    phase: 'Future'
  },
  {
    id: '8',
    title: 'Enterprise Features',
    description: 'Add enterprise-grade features including team management, SSO, and advanced audit logging.',
    status: 'Planned',
    priority: 'Medium',
    phase: 'Future'
  }
];
