export interface Lecture {
  id: string;
  title: string;
  lecturer: string;
  materials: string; // Filename for the note/plan
  videoUrl?: string; // Placeholder for video
  date: string;
  desc: string;
}

export interface Module {
  id: string;
  title: string;
  description: string;
  lectures: Lecture[];
}

export interface Assignment {
  id: string;
  title: string;
  desc: string;
  link: string;
  moduleId?: string; // Link assignment to a module
}

export interface CourseData {
  id: string;
  title: string;
  description: string;
  categoryId: string; // Reference to category
  modules: Module[];
  assignments: Assignment[];
}

export interface CourseCategory {
  id: string;
  name: string;
  icon: string; // Lucide icon name
  description: string;
  color: string; // Tailwind color class
}

// Course Categories
export const COURSE_CATEGORIES: CourseCategory[] = [
  {
    id: 'ml',
    name: '机器学习',
    icon: 'Brain',
    description: '深度学习、大语言模型、强化学习等',
    color: 'purple'
  },
  {
    id: 'cs-fundamentals',
    name: '计算机基础',
    icon: 'Cpu',
    description: '算法、数据结构、操作系统、计算机网络',
    color: 'blue'
  },
  {
    id: 'systems',
    name: '系统架构',
    icon: 'Server',
    description: '分布式系统、数据库、云计算',
    color: 'green'
  },
  {
    id: 'programming',
    name: '编程语言',
    icon: 'Code',
    description: 'Python, Rust, Go, JavaScript 等',
    color: 'orange'
  },
  {
    id: 'other',
    name: '其他',
    icon: 'BookOpen',
    description: '通用课程与资源',
    color: 'gray'
  }
];

export const CS336_DATA: CourseData = {
  id: 'cs336',
  title: 'CS336: Language Modeling',
  description: 'Stanford Spring 2025 - 从零构建大语言模型',
  categoryId: 'ml',
  modules: [
    {
      id: 'm1',
      title: 'Module 1: Foundations',
      description: '基础与架构：从零构建模型',
      lectures: [
        { id: 'lec_1', title: 'Overview, Tokenization', lecturer: 'Percy', materials: 'lecture_01.py', videoUrl: 'https://www.youtube.com/watch?list=PLoROMvodv4rOY23Y0BoGoBGgQ1zmU_MT_&index=1', date: 'Apr 1', desc: '分词：文本转数字' },
        { id: 'lec_2', title: 'PyTorch, Resource Accounting', lecturer: 'Percy', materials: 'lecture_02.py', videoUrl: 'https://www.youtube.com/watch?list=PLoROMvodv4rOY23Y0BoGoBGgQ1zmU_MT_&index=2', date: 'Apr 3', desc: '算账：显存与算力估算' },
        { id: 'lec_3', title: 'Architectures', lecturer: 'Tatsu', materials: 'lecture 3.pdf', videoUrl: 'https://www.youtube.com/watch?list=PLoROMvodv4rOY23Y0BoGoBGgQ1zmU_MT_&index=3', date: 'Apr 8', desc: '架构：Transformer 细节' }
      ]
    },
    {
      id: 'm2',
      title: 'Module 2: Systems & Efficiency',
      description: '系统与硬件效率：搞定 GPU',
      lectures: [
        { id: 'lec_4', title: 'Mixture of Experts (MoE)', lecturer: 'Tatsu', materials: 'lecture 4.pdf', videoUrl: 'https://www.youtube.com/watch?list=PLoROMvodv4rOY23Y0BoGoBGgQ1zmU_MT_&index=4', date: 'Apr 10', desc: '混合专家：高效架构' },
        { id: 'lec_5', title: 'GPUs', lecturer: 'Tatsu', materials: 'lecture 5.pdf', videoUrl: 'https://www.youtube.com/watch?list=PLoROMvodv4rOY23Y0BoGoBGgQ1zmU_MT_&index=5', date: 'Apr 15', desc: '硬件：H100/A100 架构剖析' },
        { id: 'lec_6', title: 'Kernels, Triton', lecturer: 'Tatsu', materials: 'lecture_06.py', videoUrl: 'https://www.youtube.com/watch?list=PLoROMvodv4rOY23Y0BoGoBGgQ1zmU_MT_&index=6', date: 'Apr 17', desc: '底层：手写 GPU 算子' },
        { id: 'lec_7', title: 'Parallelism (Part 1)', lecturer: 'Tatsu', materials: 'lecture 7.pdf', videoUrl: 'https://www.youtube.com/watch?list=PLoROMvodv4rOY23Y0BoGoBGgQ1zmU_MT_&index=7', date: 'Apr 22', desc: '并行：流水线/张量并行' },
        { id: 'lec_8', title: 'Parallelism (Part 2)', lecturer: 'Percy', materials: 'lecture_08.py', videoUrl: 'https://www.youtube.com/watch?list=PLoROMvodv4rOY23Y0BoGoBGgQ1zmU_MT_&index=8', date: 'Apr 24', desc: '并行：分布式数据并行' }
      ]
    },
    {
      id: 'm3',
      title: 'Module 3: The Science of Scaling',
      description: '缩放定律：预测未来',
      lectures: [
        { id: 'lec_9', title: 'Scaling Laws (Part 1)', lecturer: 'Tatsu', materials: 'lecture 9.pdf', videoUrl: 'https://www.youtube.com/watch?list=PLoROMvodv4rOY23Y0BoGoBGgQ1zmU_MT_&index=9', date: 'Apr 29', desc: '规律：计算量与 Loss 的关系' },
        { id: 'lec_11', title: 'Scaling Laws (Part 2)', lecturer: 'Tatsu', materials: 'lecture 11.pdf', videoUrl: 'https://www.youtube.com/watch?list=PLoROMvodv4rOY23Y0BoGoBGgQ1zmU_MT_&index=11', date: 'May 6', desc: '应用：数据与参数的最佳配比' }
      ]
    },
    {
      id: 'm4',
      title: 'Module 4: Lifecycle',
      description: '落地生命周期：推理、数据与评估',
      lectures: [
        { id: 'lec_10', title: 'Inference', lecturer: 'Percy', materials: 'lecture_10.py', videoUrl: 'https://www.youtube.com/watch?list=PLoROMvodv4rOY23Y0BoGoBGgQ1zmU_MT_&index=10', date: 'May 1', desc: '推理：KV Cache, 量化加速' },
        { id: 'lec_12', title: 'Evaluation', lecturer: 'Percy', materials: 'lecture_12.py', videoUrl: 'https://www.youtube.com/watch?list=PLoROMvodv4rOY23Y0BoGoBGgQ1zmU_MT_&index=12', date: 'May 8', desc: '评估：榜单与刷榜陷阱' },
        { id: 'lec_13', title: 'Data (Pre-training)', lecturer: 'Percy', materials: 'lecture_13.py', videoUrl: 'https://www.youtube.com/watch?list=PLoROMvodv4rOY23Y0BoGoBGgQ1zmU_MT_&index=13', date: 'May 13', desc: '数据：预训练数据清洗' },
        { id: 'lec_14', title: 'Data (Filtering)', lecturer: 'Percy', materials: 'lecture_14.py', videoUrl: 'https://www.youtube.com/watch?list=PLoROMvodv4rOY23Y0BoGoBGgQ1zmU_MT_&index=14', date: 'May 15', desc: '数据：合成数据与配比' }
      ]
    },
    {
      id: 'm5',
      title: 'Module 5: Alignment',
      description: '对齐与强化学习：让模型变“人”',
      lectures: [
        { id: 'lec_15', title: 'Alignment (SFT)', lecturer: 'Tatsu', materials: 'lecture 15.pdf', videoUrl: 'https://www.youtube.com/watch?list=PLoROMvodv4rOY23Y0BoGoBGgQ1zmU_MT_&index=15', date: 'May 20', desc: '微调：有监督微调与反馈' },
        { id: 'lec_16', title: 'Alignment (RL)', lecturer: 'Tatsu', materials: 'lecture 16.pdf', videoUrl: 'https://www.youtube.com/watch?list=PLoROMvodv4rOY23Y0BoGoBGgQ1zmU_MT_&index=16', date: 'May 22', desc: 'RL：PPO 算法基础' },
        { id: 'lec_17', title: 'Alignment (DPO)', lecturer: 'Percy', materials: 'lecture_17.py', videoUrl: 'https://www.youtube.com/watch?list=PLoROMvodv4rOY23Y0BoGoBGgQ1zmU_MT_&index=17', date: 'May 27', desc: '进阶：直接偏好优化' }
      ]
    },
    {
      id: 'm6',
      title: 'Module 6: Frontiers',
      description: '前沿讲座：工业界实战',
      lectures: [
        { id: 'lec_18', title: 'Guest Lecture (Alibaba)', lecturer: 'Junyang Lin', materials: '', videoUrl: 'https://www.youtube.com/embed/videoseries?list=PLoROMvodv4rOY23Y0BoGoBGgQ1zmU_MT_&index=18', date: 'May 29', desc: 'Qwen Team' },
        { id: 'lec_19', title: 'Guest Lecture (Meta)', lecturer: 'Mike Lewis', materials: '', videoUrl: 'https://www.youtube.com/embed/videoseries?list=PLoROMvodv4rOY23Y0BoGoBGgQ1zmU_MT_&index=19', date: 'June 3', desc: 'FAIR Team' }
      ]
    }
  ],
  assignments: [
    { id: 'a1', title: 'Assignment 1: Basics', desc: '实现 Transformer 核心组件', link: 'https://github.com/stanford-cs336/spring2024-assignment1-basics', moduleId: 'm1' },
    { id: 'a2', title: 'Assignment 2: Systems', desc: '性能分析与优化，GPU Kernel', link: 'https://github.com/stanford-cs336/spring2024-assignment2-systems', moduleId: 'm2' },
    { id: 'a3', title: 'Assignment 3: Scaling', desc: '拟合 Scaling Laws', link: 'https://github.com/stanford-cs336/spring2024-assignment3-scaling', moduleId: 'm3' },
    { id: 'a4', title: 'Assignment 4: Data', desc: '处理 Common Crawl 数据', link: 'https://github.com/stanford-cs336/spring2024-assignment4-data', moduleId: 'm4' },
    { id: 'a5', title: 'Assignment 5: Alignment', desc: 'RLHF 对齐', link: 'https://github.com/stanford-cs336/spring2024-assignment5-alignment', moduleId: 'm5' }
  ]
};
