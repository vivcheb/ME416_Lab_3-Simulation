import { WaypointInput } from '../types/robotics';

export interface CoursePreset {
  id: string;
  name: string;
  description: string;
  waypoints: WaypointInput[];
}

export const COURSE_PRESETS: CoursePreset[] = [
  {
    id: 'course1',
    name: 'Course 1 (Basic Dubins Curve)',
    description: 'Start [-3.5, -1.5, 0°] to Goal [3.5, 1.5, 0°] without intermediate gates.',
    waypoints: [
      { id: 'wp_start', x: -3.5, y: -1.5, thetaDeg: 0, isGate: false },
      { id: 'wp_goal', x: 3.5, y: 1.5, thetaDeg: 0, isGate: false },
    ],
  },
  {
    id: 'course2',
    name: 'Course 2 (S-Curve Gate)',
    description: 'Start [-3.5, -1.5, 0°] traversing Gate 1 [0.0, 0.0, 90°] to Goal [3.5, 1.5, 0°].',
    waypoints: [
      { id: 'wp_start', x: -3.5, y: -1.5, thetaDeg: 0, isGate: false },
      { id: 'wp_gate1', x: 0.0, y: 0.0, thetaDeg: 90, isGate: true },
      { id: 'wp_goal', x: 3.5, y: 1.5, thetaDeg: 0, isGate: false },
    ],
  },
  {
    id: 'course3',
    name: 'Course 3 (Multi-Gate Slalom)',
    description: 'Dynamic 4-pose chicane passing through dual gates across the arena.',
    waypoints: [
      { id: 'wp_start', x: -3.5, y: -1.0, thetaDeg: 20, isGate: false },
      { id: 'wp_gate1', x: -1.0, y: 1.2, thetaDeg: 0, isGate: true },
      { id: 'wp_gate2', x: 1.0, y: -1.2, thetaDeg: 0, isGate: true },
      { id: 'wp_goal', x: 3.5, y: 1.0, thetaDeg: -20, isGate: false },
    ],
  },
];
