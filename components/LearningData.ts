export interface Lecture {
  id: string;
  title: string;
  lecturer: string;
  materials: string; // Filename for the note/plan
  videoUrl?: string; // Placeholder for video
  type?: 'video' | 'note'; // Type of resource
  date: string;
  desc: string;
}

export interface Module {
  id: string;
  title: string;
  description: string;
  lectures: Lecture[];
}

// Generic resource item for assignments and personal resources
export interface ResourceItem {
  id: string;
  title: string;
  link: string;
}

// Module for assignments section (independent from course modules)
export interface AssignmentModule {
  id: string;
  title: string;
  description: string;
  items: ResourceItem[];
}

// Module for personal resources section (independent from course modules)
export interface PersonalModule {
  id: string;
  title: string;
  description: string;
  items: ResourceItem[];
}

// Keep old interfaces for backward compatibility
export interface Assignment {
  id: string;
  title: string;
  desc: string;
  link: string;
  moduleId?: string; // Link assignment to a module
}

export interface PersonalResource {
  id: string;
  title: string;
  link: string;
  moduleId?: string; // Link resource to a module
}

export interface CourseData {
  id: string;
  title: string;
  description: string;
  categoryId: string; // Reference to category
  modules: Module[];
  // Old structure (deprecated)
  assignments: Assignment[];
  personalResources?: PersonalResource[];
  // New structure with independent modules
  assignmentModules?: AssignmentModule[];
  personalModules?: PersonalModule[];
  introMarkdown?: string; // Optional markdown content for course introduction
  icon?: string; // Optional icon for the course
  priority?: number; // 1-100, lower number = higher priority
}

export interface CourseCategory {
  id: string;
  name: string;
  icon: string; // Lucide icon name
  description: string;
  color: string; // Tailwind color class
  priority?: number; // 1-100, lower number = higher priority
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
    id: 'tools',
    name: '工具栈',
    icon: 'Wrench',
    description: 'Docker, Git, Linux, Kubernetes',
    color: 'cyan'
  },
  {
    id: 'other',
    name: '其他',
    icon: 'BookOpen',
    description: '通用课程与资源',
    color: 'gray'
  }
];

export const DOCKER_DATA: CourseData = {
  id: 'docker-mastery',
  title: 'Docker 容器化技术实战',
  description: '从基础命令到容器编排，全面掌握 Docker 开发与部署流程',
  categoryId: 'tools',
  modules: [
    {
      id: 'm1',
      title: 'Module 1: Docker 基础概念',
      description: '核心概念：镜像、容器与仓库',
      lectures: [
        { id: 'docker_1', title: 'Docker 简介与架构', lecturer: 'Guyue', materials: 'docker_intro.md', videoUrl: '', date: 'Day 1', desc: '理解 Docker 解决了什么问题，C/S 架构解析' },
        { id: 'docker_2', title: '安装与环境配置', lecturer: 'Guyue', materials: 'docker_install.md', videoUrl: '', date: 'Day 1', desc: 'Linux/Mac/Windows 安装指南，配置镜像加速' },
        { id: 'docker_3', title: '常用命令详解 (Part 1)', lecturer: 'Guyue', materials: 'docker_cmd_1.md', videoUrl: '', date: 'Day 2', desc: 'run, ps, stop, rm, images, rmi' }
      ]
    },
    {
      id: 'm2',
      title: 'Module 2: 镜像构建与管理',
      description: 'Dockerfile 编写最佳实践',
      lectures: [
        { id: 'docker_4', title: 'Dockerfile 基础指令', lecturer: 'Guyue', materials: 'dockerfile_basics.md', videoUrl: '', date: 'Day 3', desc: 'FROM, RUN, COPY, CMD, ENTRYPOINT' },
        { id: 'docker_5', title: '镜像分层与缓存', lecturer: 'Guyue', materials: 'docker_layers.md', videoUrl: '', date: 'Day 3', desc: '理解 UnionFS，优化构建速度与体积' },
        { id: 'docker_6', title: '多阶段构建', lecturer: 'Guyue', materials: 'docker_multistage.md', videoUrl: '', date: 'Day 4', desc: '减小镜像体积的终极武器' }
      ]
    },
    {
      id: 'm3',
      title: 'Module 3: 网络与存储',
      description: '数据持久化与容器互联',
      lectures: [
        { id: 'docker_7', title: 'Docker Volume', lecturer: 'Guyue', materials: 'docker_volume.md', videoUrl: '', date: 'Day 5', desc: 'Bind Mount vs Volume，数据持久化方案' },
        { id: 'docker_8', title: 'Docker Network', lecturer: 'Guyue', materials: 'docker_network.md', videoUrl: '', date: 'Day 6', desc: 'Bridge, Host, None 模式，自定义网络' }
      ]
    },
    {
      id: 'm4',
      title: 'Module 4: Docker Compose',
      description: '单机多容器编排',
      lectures: [
        { id: 'docker_9', title: 'Compose 简介与安装', lecturer: 'Guyue', materials: 'compose_intro.md', videoUrl: '', date: 'Day 7', desc: '为什么需要 Compose，YAML 语法基础' },
        { id: 'docker_10', title: '编写 docker-compose.yml', lecturer: 'Guyue', materials: 'compose_file.md', videoUrl: '', date: 'Day 8', desc: 'services, networks, volumes 配置详解' },
        { id: 'docker_11', title: '实战：部署 LNMP 栈', lecturer: 'Guyue', materials: 'compose_lnmp.md', videoUrl: '', date: 'Day 9', desc: 'Nginx + MySQL + PHP 综合实战' }
      ]
    }
  ],
  assignments: [
    { id: 'a1', title: 'Assignment 1: 你的第一个 Dockerfile', desc: '编写一个 Python Flask 应用的 Dockerfile 并运行', link: '', moduleId: 'm2' },
    { id: 'a2', title: 'Assignment 2: 数据持久化', desc: '运行 MySQL 容器并挂载数据卷，确保数据不丢失', link: '', moduleId: 'm3' },
    { id: 'a3', title: 'Assignment 3: 微服务编排', desc: '使用 Docker Compose 编排前端、后端和数据库', link: '', moduleId: 'm4' }
  ]
};

export const GIT_DATA: CourseData = {
  id: 'git-mastery',
  title: 'Git 版本控制精通',
  description: '从基础操作到高级工作流，掌握现代软件开发的协作基石',
  categoryId: 'tools',
  modules: [
    {
      id: 'm1',
      title: 'Module 1: Git 基础',
      description: '版本控制的核心概念与基本操作',
      lectures: [
        { id: 'git_1', title: 'Git 原理与配置', lecturer: 'Guyue', materials: 'git_intro.md', videoUrl: '', date: 'Day 1', desc: '分布式版本控制原理，config 配置' },
        { id: 'git_2', title: '基础工作流', lecturer: 'Guyue', materials: 'git_basics.md', videoUrl: '', date: 'Day 1', desc: 'init, add, commit, status, log' },
        { id: 'git_3', title: '撤销与回滚', lecturer: 'Guyue', materials: 'git_undo.md', videoUrl: '', date: 'Day 2', desc: 'checkout, reset, revert 详解' }
      ]
    },
    {
      id: 'm2',
      title: 'Module 2: 分支管理',
      description: '并行开发的核心艺术',
      lectures: [
        { id: 'git_4', title: '分支操作', lecturer: 'Guyue', materials: 'git_branch.md', videoUrl: '', date: 'Day 3', desc: 'branch, checkout, switch, merge' },
        { id: 'git_5', title: '解决冲突', lecturer: 'Guyue', materials: 'git_conflict.md', videoUrl: '', date: 'Day 3', desc: '手动解决合并冲突的技巧' },
        { id: 'git_6', title: 'Rebase 变基', lecturer: 'Guyue', materials: 'git_rebase.md', videoUrl: '', date: 'Day 4', desc: '保持提交历史整洁的利器' }
      ]
    },
    {
      id: 'm3',
      title: 'Module 3: 远程协作',
      description: 'GitHub/GitLab 团队协作流程',
      lectures: [
        { id: 'git_7', title: '远程仓库', lecturer: 'Guyue', materials: 'git_remote.md', videoUrl: '', date: 'Day 5', desc: 'remote, push, pull, fetch' },
        { id: 'git_8', title: 'Pull Request 工作流', lecturer: 'Guyue', materials: 'git_pr.md', videoUrl: '', date: 'Day 6', desc: 'Fork & PR 模式，Code Review' }
      ]
    },
    {
      id: 'm4',
      title: 'Module 4: 高级技巧',
      description: '提升效率的进阶命令',
      lectures: [
        { id: 'git_9', title: 'Stash 暂存', lecturer: 'Guyue', materials: 'git_stash.md', videoUrl: '', date: 'Day 7', desc: '临时保存工作现场' },
        { id: 'git_10', title: 'Cherry-pick', lecturer: 'Guyue', materials: 'git_cherrypick.md', videoUrl: '', date: 'Day 7', desc: '挑选特定提交应用到当前分支' },
        { id: 'git_11', title: 'Submodules', lecturer: 'Guyue', materials: 'git_submodules.md', videoUrl: '', date: 'Day 8', desc: '管理嵌套的 Git 仓库' }
      ]
    }
  ],
  assignments: [
    { id: 'a1', title: 'Assignment 1: 本地版本控制', desc: '初始化仓库，进行多次提交并尝试回滚', link: '', moduleId: 'm1' },
    { id: 'a2', title: 'Assignment 2: 分支与合并', desc: '模拟多人开发，创建特性分支并解决合并冲突', link: '', moduleId: 'm2' },
    { id: 'a3', title: 'Assignment 3: 开源贡献', desc: 'Fork 一个开源项目，提交 PR 并进行同步', link: '', moduleId: 'm3' }
  ]
};

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
