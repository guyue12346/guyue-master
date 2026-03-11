import { Brain, Cpu, Server, Code, Wrench, BookOpen, GraduationCap, Globe, Database, Cloud, Terminal, Layout, Layers, Box, Circle, Disc, Rocket, Lightbulb, Target, Puzzle, Microscope, FlaskConical, Atom, Network, FileCode, GitBranch, Zap, Shield, Lock, Key, Monitor, Smartphone, Wifi, Radio, Sparkles, Star } from 'lucide-react';

// Shared icon list used by LearningCategoryModal, LearningCourseModal, and LearningManager
export const AVAILABLE_ICONS = [
  { name: 'Brain', icon: Brain },
  { name: 'Cpu', icon: Cpu },
  { name: 'Server', icon: Server },
  { name: 'Code', icon: Code },
  { name: 'Wrench', icon: Wrench },
  { name: 'BookOpen', icon: BookOpen },
  { name: 'GraduationCap', icon: GraduationCap },
  { name: 'Globe', icon: Globe },
  { name: 'Database', icon: Database },
  { name: 'Cloud', icon: Cloud },
  { name: 'Terminal', icon: Terminal },
  { name: 'Layout', icon: Layout },
  { name: 'Layers', icon: Layers },
  { name: 'Box', icon: Box },
  { name: 'Circle', icon: Circle },
  { name: 'Disc', icon: Disc },
  { name: 'Rocket', icon: Rocket },
  { name: 'Lightbulb', icon: Lightbulb },
  { name: 'Target', icon: Target },
  { name: 'Puzzle', icon: Puzzle },
  { name: 'Microscope', icon: Microscope },
  { name: 'FlaskConical', icon: FlaskConical },
  { name: 'Atom', icon: Atom },
  { name: 'Network', icon: Network },
  { name: 'FileCode', icon: FileCode },
  { name: 'GitBranch', icon: GitBranch },
  { name: 'Zap', icon: Zap },
  { name: 'Shield', icon: Shield },
  { name: 'Lock', icon: Lock },
  { name: 'Key', icon: Key },
  { name: 'Monitor', icon: Monitor },
  { name: 'Smartphone', icon: Smartphone },
  { name: 'Wifi', icon: Wifi },
  { name: 'Radio', icon: Radio },
  { name: 'Sparkles', icon: Sparkles },
  { name: 'Star', icon: Star },
];

export const AVAILABLE_COLORS = [
  { name: 'purple', bg: 'bg-purple-100', text: 'text-purple-600', border: 'border-purple-200' },
  { name: 'blue', bg: 'bg-blue-100', text: 'text-blue-600', border: 'border-blue-200' },
  { name: 'green', bg: 'bg-green-100', text: 'text-green-600', border: 'border-green-200' },
  { name: 'orange', bg: 'bg-orange-100', text: 'text-orange-600', border: 'border-orange-200' },
  { name: 'cyan', bg: 'bg-cyan-100', text: 'text-cyan-600', border: 'border-cyan-200' },
  { name: 'gray', bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' },
  { name: 'red', bg: 'bg-red-100', text: 'text-red-600', border: 'border-red-200' },
  { name: 'yellow', bg: 'bg-yellow-100', text: 'text-yellow-600', border: 'border-yellow-200' },
  { name: 'pink', bg: 'bg-pink-100', text: 'text-pink-600', border: 'border-pink-200' },
  { name: 'indigo', bg: 'bg-indigo-100', text: 'text-indigo-600', border: 'border-indigo-200' },
];

// Color map with actual color values for dynamic styling (avoids Tailwind purge issues)
export const colorMap: Record<string, { bg: string; bgColor: string; text: string; textColor: string; border: string; borderColor: string; hoverBorderColor: string }> = {
  purple: { bg: 'bg-purple-50', bgColor: '#faf5ff', text: 'text-purple-600', textColor: '#9333ea', border: 'border-purple-200', borderColor: '#e9d5ff', hoverBorderColor: '#a855f7' },
  blue: { bg: 'bg-blue-50', bgColor: '#eff6ff', text: 'text-blue-600', textColor: '#2563eb', border: 'border-blue-200', borderColor: '#bfdbfe', hoverBorderColor: '#3b82f6' },
  green: { bg: 'bg-green-50', bgColor: '#f0fdf4', text: 'text-green-600', textColor: '#16a34a', border: 'border-green-200', borderColor: '#bbf7d0', hoverBorderColor: '#22c55e' },
  orange: { bg: 'bg-orange-50', bgColor: '#fff7ed', text: 'text-orange-600', textColor: '#ea580c', border: 'border-orange-200', borderColor: '#fed7aa', hoverBorderColor: '#f97316' },
  cyan: { bg: 'bg-cyan-50', bgColor: '#ecfeff', text: 'text-cyan-600', textColor: '#0891b2', border: 'border-cyan-200', borderColor: '#a5f3fc', hoverBorderColor: '#06b6d4' },
  gray: { bg: 'bg-gray-50', bgColor: '#f9fafb', text: 'text-gray-600', textColor: '#4b5563', border: 'border-gray-200', borderColor: '#e5e7eb', hoverBorderColor: '#6b7280' },
  red: { bg: 'bg-red-50', bgColor: '#fef2f2', text: 'text-red-600', textColor: '#dc2626', border: 'border-red-200', borderColor: '#fecaca', hoverBorderColor: '#ef4444' },
  yellow: { bg: 'bg-yellow-50', bgColor: '#fefce8', text: 'text-yellow-600', textColor: '#ca8a04', border: 'border-yellow-200', borderColor: '#fef08a', hoverBorderColor: '#eab308' },
  pink: { bg: 'bg-pink-50', bgColor: '#fdf2f8', text: 'text-pink-600', textColor: '#db2777', border: 'border-pink-200', borderColor: '#fbcfe8', hoverBorderColor: '#ec4899' },
  indigo: { bg: 'bg-indigo-50', bgColor: '#eef2ff', text: 'text-indigo-600', textColor: '#4f46e5', border: 'border-indigo-200', borderColor: '#c7d2fe', hoverBorderColor: '#6366f1' },
};

// Helper to get category icon component by name
export const getCategoryIcon = (iconName: string) => {
  const icons: Record<string, any> = {
    Brain, Cpu, Server, Code, BookOpen, GraduationCap, Wrench,
    Globe, Database, Cloud, Terminal, Layout, Layers, Box, Circle, Disc,
    Rocket, Lightbulb, Target, Puzzle, Microscope, FlaskConical, Atom, Network,
    FileCode, GitBranch, Zap, Shield, Lock, Key, Monitor, Smartphone, Wifi, Radio, Sparkles, Star
  };
  return icons[iconName] || BookOpen;
};
