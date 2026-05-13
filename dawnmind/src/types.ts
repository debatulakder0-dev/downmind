
export interface UserProfile {
  name: string;
  gender: string;
  occupation: string;
  wakeTime: string;
  importantTaskTime: string;
  relationshipStatus: string;
  reminderStyle: string;
  companion: 'mala' | 'joseph';
}

export interface Todo {
  id: string;
  text: string;
  time: string;
  completed: boolean;
  createdAt: number;
}

export type Pose = 'idle' | 'wave' | 'thumbsup' | 'remind' | 'fist' | 'point' | 'arms' | 'confused' | 'celebrate';
