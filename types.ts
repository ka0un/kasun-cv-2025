
export interface Profile {
  name: string;
  title: string;
  email: string;
  phone: string;
  website: string;
  socials: { name: string; url: string; username: string; }[];
}

export interface Experience {
  role: string;
  company: string;
  location: string;
  url: string;
  period: string;
  tasks: string[];
}

export interface Project {
  name: string;
  description: string;
  details: string[];
  url: string;
  revenue?: string;
}

export interface Education {
  degree: string;
  institution: string;
  url: string;
  gpa?: string;
  details: string[];
}

export interface Certificate {
  name: string;
  issuer: string;
  url: string;
  details: string[];
}

export interface Organization {
  name: string;
  role: string;
  period: string;
  description?: string;
}

export interface CVData {
  profile: Profile;
  summary: string;
  skills: string[];
  experience: Experience[];
  projects: Project[];
  education: Education[];
  certificates: Certificate[];
  organizations: Organization[];
}
