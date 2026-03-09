import React, { useState, useEffect } from 'react';
import { X, RefreshCw, ExternalLink, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import type { OJSubmission } from '../../types';

interface LeetCodeSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSync: (submissions: OJSubmission[], isIncremental: boolean) => void;
  existingSubmissions?: OJSubmission[]; // 已有的提交记录
}

// 获取上次同步时间戳
const getLastSyncTimestamp = (): number => {
  const saved = localStorage.getItem('leetcode_last_sync_timestamp');
  return saved ? parseInt(saved, 10) : 0;
};

// 保存同步时间戳
const saveLastSyncTimestamp = (timestamp: number) => {
  localStorage.setItem('leetcode_last_sync_timestamp', String(timestamp));
};

// 获取用户提交日历和统计数据
async function fetchLeetCodeData(
  session: string, 
  onProgress: (msg: string) => void,
  lastSyncTimestamp: number = 0
): Promise<{
  easy: number;
  medium: number;
  hard: number;
  calendar: Record<string, number>; // date -> count
  problems: Array<{ id: string; title: string; difficulty: string; timestamp: number; isAC: boolean }>;
  latestTimestamp: number; // 本次获取的最新时间戳
}> {
  // 检查是否在 Electron 环境
  if (!window.electronAPI?.leetcodeApi) {
    throw new Error('请在桌面应用中使用同步功能');
  }

  const api = window.electronAPI.leetcodeApi;

  onProgress('正在获取用户信息...');

  // 获取当前用户信息
  const userQuery = `
    query globalData {
      userStatus {
        username
        realName
        userSlug
      }
    }
  `;

  const userData = await api({ query: userQuery, variables: {}, session });
  const userSlug = userData?.data?.userStatus?.userSlug;

  if (!userSlug) {
    throw new Error('无法获取用户信息，请检查 Session 是否有效');
  }

  onProgress(`用户: ${userSlug}，正在获取统计数据...`);

  // 获取统计数据
  const statsQuery = `
    query userProfileUserQuestionProgress($userSlug: String!) {
      userProfileUserQuestionProgress(userSlug: $userSlug) {
        numAcceptedQuestions {
          difficulty
          count
        }
      }
    }
  `;

  const statsData = await api({ query: statsQuery, variables: { userSlug }, session });

  let easy = 0, medium = 0, hard = 0;
  const accepted = statsData?.data?.userProfileUserQuestionProgress?.numAcceptedQuestions || [];
  for (const item of accepted) {
    if (item.difficulty === 'EASY') easy = item.count;
    else if (item.difficulty === 'MEDIUM') medium = item.count;
    else if (item.difficulty === 'HARD') hard = item.count;
  }

  onProgress('正在获取提交日历...');

  // 使用 REST API 获取提交日历（热力图数据）
  const calendar: Record<string, number> = {};

  try {
    const calendarData = await api({
      query: '__REST__',
      variables: { url: `https://leetcode.cn/api/user_submission_calendar/${userSlug}/` },
      session
    });

    if (calendarData && typeof calendarData === 'string') {
      const parsed = JSON.parse(calendarData);
      for (const [timestamp, count] of Object.entries(parsed)) {
        // timestamp 是秒级时间戳
        const date = new Date(parseInt(timestamp) * 1000);
        const dateStr = formatDate(date.getTime());
        calendar[dateStr] = (calendar[dateStr] || 0) + (count as number);
      }
    } else if (calendarData && typeof calendarData === 'object') {
      for (const [timestamp, count] of Object.entries(calendarData)) {
        const date = new Date(parseInt(timestamp) * 1000);
        const dateStr = formatDate(date.getTime());
        calendar[dateStr] = (calendar[dateStr] || 0) + (count as number);
      }
    }
  } catch (e) {
    console.error('获取日历失败:', e);
  }

  onProgress(lastSyncTimestamp > 0 
    ? `正在获取 ${new Date(lastSyncTimestamp).toLocaleDateString()} 之后的提交记录...` 
    : '正在获取全部提交记录...');

  // 使用 submissionList API 分页获取所有提交（不带 status 参数，在客户端过滤）
  const submissionListQuery = `
    query submissionList($offset: Int!, $limit: Int!) {
      submissionList(offset: $offset, limit: $limit, questionSlug: "") {
        lastKey
        hasNext
        submissions {
          id
          timestamp
          statusDisplay
          lang
          title
        }
      }
    }
  `;

  const allSubmissions: Array<{ id: string; timestamp: string; title: string; isAC: boolean }> = [];
  let offset = 0;
  const limit = 40; // LeetCode API 单次最多返回 40 条
  let hasNext = true;
  let latestTimestamp = 0;
  let reachedLastSync = false;

  // 分页获取提交（增量模式下遇到已同步的记录就停止）
  while (hasNext && !reachedLastSync) {
    try {
      onProgress(`正在获取提交列表 (${allSubmissions.length} 条)...`);

      const listData = await api({
        query: submissionListQuery,
        variables: { offset, limit },
        session
      });

      console.log('[LeetCode] submissionList 响应:', JSON.stringify(listData));

      const result = listData?.data?.submissionList;
      if (!result || !result.submissions || result.submissions.length === 0) {
        console.log('[LeetCode] submissionList 返回空数据，停止获取');
        break;
      }

      // 保留所有提交
      for (const sub of result.submissions) {
        const subTimestamp = parseInt(sub.timestamp) * 1000; // 转为毫秒
        
        // 记录最新的时间戳
        if (subTimestamp > latestTimestamp) {
          latestTimestamp = subTimestamp;
        }
        
        // 增量同步：如果遇到已同步过的记录，停止获取
        if (lastSyncTimestamp > 0 && subTimestamp <= lastSyncTimestamp) {
          console.log(`[LeetCode] 遇到已同步记录 (${sub.timestamp})，停止获取`);
          reachedLastSync = true;
          break;
        }
        
        allSubmissions.push({
          id: sub.id,
          timestamp: sub.timestamp,
          title: sub.title,
          isAC: sub.statusDisplay === 'Accepted',
        });
      }

      hasNext = result.hasNext;
      offset += limit;

      // 防止请求过快被限流
      if (hasNext) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (e) {
      console.error('获取提交列表失败:', e);
      break;
    }
  }

  const acSubmissions = allSubmissions.filter(s => s.isAC);
  onProgress(`共 ${allSubmissions.length} 次提交，${acSubmissions.length} 次 AC，正在获取详细信息...`);

  const problems: Array<{ id: string; title: string; difficulty: string; timestamp: number; isAC: boolean }> = [];
  const failedSubmissions: Array<{ id: string; timestamp: string; title: string; isAC: boolean }> = [];

  // 限制获取详情的数量（API限流，最多获取60条）
  const MAX_DETAIL_FETCH = 60;
  const submissionsToFetch = allSubmissions.slice(0, MAX_DETAIL_FETCH);
  const skippedCount = allSubmissions.length - submissionsToFetch.length;
  
  if (skippedCount > 0) {
    onProgress(`由于API限制，仅获取最近 ${MAX_DETAIL_FETCH} 条提交的详情（跳过 ${skippedCount} 条旧记录）...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 带重试的获取详情函数
  const fetchDetailWithRetry = async (sub: { id: string; timestamp: string; title: string; isAC: boolean }, maxRetries = 3) => {
    const detailQuery = `
      query submissionDetail($id: ID!) {
        submissionDetail(submissionId: $id) {
          id
          timestamp
          question {
            questionFrontendId
            title
            difficulty
          }
        }
      }
    `;

    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        if (retry > 0) {
          // 重试前等待更长时间（指数退避）
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retry)));
        }
        const detailData = await api({ query: detailQuery, variables: { id: sub.id }, session });
        const detail = detailData?.data?.submissionDetail;
        if (detail && detail.question) {
          return { ...detail, isAC: sub.isAC };
        }
        // 如果返回空数据，可能是限流，短暂等待
        if (retry < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (e) {
        console.error(`获取提交 ${sub.id} 详情失败 (重试 ${retry + 1}/${maxRetries}):`, e);
      }
    }
    return null;
  };

  // 逐个获取每个提交的详细信息（串行，避免被限流）
  if (submissionsToFetch.length > 0) {
    let successCount = 0;
    let consecutiveFailures = 0; // 连续失败计数

    for (let i = 0; i < submissionsToFetch.length; i++) {
      const sub = submissionsToFetch[i];

      // 每10条显示一次进度
      if (i % 10 === 0 || i === submissionsToFetch.length - 1) {
        onProgress(`正在获取详情 (${i + 1}/${submissionsToFetch.length}, 成功 ${successCount})...`);
      }

      // 如果连续失败太多次，增加等待时间
      if (consecutiveFailures >= 5) {
        onProgress(`检测到限流，等待 5 秒后继续...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        consecutiveFailures = 0;
      }

      const detail = await fetchDetailWithRetry(sub);

      if (detail && detail.question) {
        successCount++;
        consecutiveFailures = 0;
        problems.push({
          id: detail.question.questionFrontendId,
          title: detail.question.title,
          difficulty: detail.question.difficulty,
          timestamp: parseInt(detail.timestamp) * 1000,
          isAC: sub.isAC,
        });
      } else {
        console.log(`[LeetCode] 提交 ${sub.id} (${sub.title}) 获取详情失败`);
        consecutiveFailures++;
        // 记录获取失败的提交
        failedSubmissions.push(sub);
      }

      // 每次请求后等待，避免限流
      if (i < submissionsToFetch.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }

  // 对获取失败的提交，直接使用已有信息作为兜底
  if (failedSubmissions.length > 0) {
    onProgress(`${failedSubmissions.length} 条记录获取详情失败，使用基本信息...`);

    for (const sub of failedSubmissions) {
      // 兜底：使用已有信息，难度标记为未知
      problems.push({
        id: `unknown_${sub.id}`,
        title: sub.title,
        difficulty: 'MEDIUM', // 默认中等
        timestamp: parseInt(sub.timestamp) * 1000,
        isAC: sub.isAC,
      });
    }
  }

  const acCount = problems.filter(p => p.isAC).length;
  onProgress(`获取完成！共 ${problems.length} 次新提交，${acCount} 次 AC`);

  return { easy, medium, hard, calendar, problems, latestTimestamp };
}

// 格式化日期
const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 难度转换
const difficultyToCategory = (difficulty: string): string => {
  const map: Record<string, string> = {
    'EASY': 'easy',
    'MEDIUM': 'medium',
    'HARD': 'hard',
  };
  return map[difficulty] || 'medium';
};

export const LeetCodeSyncModal: React.FC<LeetCodeSyncModalProps> = ({
  isOpen,
  onClose,
  onSync,
  existingSubmissions = [],
}) => {
  const [session, setSession] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [stats, setStats] = useState<{ easy: number; medium: number; hard: number } | null>(null);
  const [syncMode, setSyncMode] = useState<'incremental' | 'full'>('incremental');
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);

  // 初始化时读取上次同步时间
  useEffect(() => {
    const lastSync = getLastSyncTimestamp();
    setLastSyncTime(lastSync);
  }, [isOpen]);

  const handleSync = async () => {
    if (!session.trim()) {
      setStatus('error');
      setMessage('请输入 LEETCODE_SESSION');
      return;
    }

    setStatus('loading');
    setMessage('正在同步数据...');

    try {
      const lastSyncTimestamp = syncMode === 'incremental' ? lastSyncTime : 0;
      const isIncrementalSync = lastSyncTimestamp > 0;
      const data = await fetchLeetCodeData(session.trim(), setMessage, lastSyncTimestamp);
      setStats({ easy: data.easy, medium: data.medium, hard: data.hard });

      // 生成提交记录
      const submissions: OJSubmission[] = [];

      // 增量同步时，只处理新获取的 problems 数据
      if (isIncrementalSync) {
        if (data.problems.length > 0) {
          for (const prob of data.problems) {
            const categoryId = prob.isAC ? difficultyToCategory(prob.difficulty) : 'unknown';
            submissions.push({
              id: `lc_${prob.id}_${prob.timestamp}`,
              siteId: 'leetcode',
              categoryId,
              problemId: prob.id,
              problemTitle: prob.isAC ? prob.title : `${prob.title} (未通过)`,
              timestamp: prob.timestamp,
              date: formatDate(prob.timestamp),
            });
          }
          setMessage(`增量同步成功！新增 ${data.problems.length} 条提交记录`);
        } else {
          setStatus('success');
          setMessage('已是最新，没有新的提交记录');
          // 没有新数据，不需要更新
          return;
        }
      } else {
        // 全量同步：优先使用日历数据（真实的提交日期和次数）
        if (Object.keys(data.calendar).length > 0) {
          // 创建题目详情映射（按日期分组）
          const problemsByDate: Record<string, Array<{ id: string; title: string; difficulty: string; timestamp: number; isAC: boolean }>> = {};
          for (const prob of data.problems) {
            const dateStr = formatDate(prob.timestamp);
            if (!problemsByDate[dateStr]) {
              problemsByDate[dateStr] = [];
            }
            problemsByDate[dateStr].push(prob);
          }

          // 根据日历数据生成提交记录
          for (const [dateStr, count] of Object.entries(data.calendar)) {
            const dateProblems = problemsByDate[dateStr] || [];
            const dateTimestamp = new Date(dateStr).getTime();

            if (dateProblems.length > 0) {
              // 有详细记录的日期，使用详细数据（包含所有提交，不只是AC）
              for (const prob of dateProblems) {
                // 只有 AC 的才计入难度统计，非 AC 的标记为 unknown
                const categoryId = prob.isAC ? difficultyToCategory(prob.difficulty) : 'unknown';
                submissions.push({
                  id: `lc_${prob.id}_${prob.timestamp}`,
                  siteId: 'leetcode',
                  categoryId,
                  problemId: prob.id,
                  problemTitle: prob.isAC ? prob.title : `${prob.title} (未通过)`,
                  timestamp: prob.timestamp,
                  date: dateStr,
                });
              }
            }

            // 如果日历显示的提交数比详细记录多，补充匿名记录（用于热力图计数）
            const remaining = count - dateProblems.length;
            if (remaining > 0) {
              // 只生成一条汇总记录，不生成多条占位符
              submissions.push({
                id: `lc_cal_${dateStr}_summary`,
                siteId: 'leetcode',
                categoryId: 'unknown', // 未知难度
                problemId: `(${remaining}次提交)`,
                timestamp: dateTimestamp,
                date: dateStr,
              });
            }
          }

          const totalDays = Object.keys(data.calendar).length;
          const totalSubmissions = Object.values(data.calendar).reduce((a, b) => a + b, 0);
          const detailCount = data.problems.length;
          setMessage(`同步成功！${totalDays} 个活跃日，${totalSubmissions} 次提交，${detailCount} 条详细记录`);
        } else if (data.problems.length > 0) {
          // 没有日历但有详细记录
          for (const prob of data.problems) {
            submissions.push({
              id: `lc_${prob.id}_${prob.timestamp}`,
              siteId: 'leetcode',
              categoryId: difficultyToCategory(prob.difficulty),
              problemId: prob.id,
              problemTitle: prob.title,
              timestamp: prob.timestamp,
              date: formatDate(prob.timestamp),
            });
          }
          setMessage(`同步成功！获取到 ${submissions.length} 次提交记录`);
        } else {
          // 都没有，提示用户
          setStatus('error');
          setMessage('未能获取到提交记录，请检查账号是否有提交历史');
          return;
        }
      }

      // 添加统计数据作为元信息（用于显示正确的总题数）
      // 存储到第一条提交中作为标记
      if (submissions.length > 0) {
        submissions.push({
          id: 'lc_stats_meta',
          siteId: 'leetcode',
          categoryId: 'meta',
          problemId: `统计:${data.easy},${data.medium},${data.hard}`,
          timestamp: 0,
          date: '0000-00-00',
        });
      }

      // 保存本次同步的最新时间戳
      if (data.latestTimestamp > 0) {
        saveLastSyncTimestamp(data.latestTimestamp);
        setLastSyncTime(data.latestTimestamp);
      }

      setStatus('success');
      // 传递是否为增量同步的标志
      onSync(submissions, isIncrementalSync);
    } catch (error: any) {
      setStatus('error');
      setMessage(error.message || '同步失败，请检查网络或 Session');
    }
  };

  const openLeetCode = () => {
    window.open('https://leetcode.cn/', '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-[500px] max-w-[90vw]">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-orange-500" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              同步 LeetCode 数据
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-4">
          {/* 说明 */}
          <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-3 text-sm">
            <p className="text-blue-700 dark:text-blue-300 mb-2">
              <strong>获取步骤：</strong>
            </p>
            <ol className="list-decimal list-inside space-y-1 text-blue-600 dark:text-blue-400">
              <li>点击下方按钮打开 LeetCode 并登录</li>
              <li>按 F12 打开开发者工具</li>
              <li>切换到 Application → Cookies → leetcode.cn</li>
              <li>找到 <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">LEETCODE_SESSION</code> 并复制值</li>
              <li>粘贴到下方输入框</li>
            </ol>
          </div>

          {/* 打开 LeetCode 按钮 */}
          <button
            onClick={openLeetCode}
            className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm
                       text-orange-600 dark:text-orange-400 border border-orange-300 dark:border-orange-700
                       hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            打开 LeetCode 登录
          </button>

          {/* Session 输入 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              LEETCODE_SESSION
            </label>
            <textarea
              value={session}
              onChange={(e) => setSession(e.target.value)}
              placeholder="粘贴 LEETCODE_SESSION 的值..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                         focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent
                         font-mono"
            />
          </div>

          {/* 同步模式选择 */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              同步模式
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="syncMode"
                  value="incremental"
                  checked={syncMode === 'incremental'}
                  onChange={() => setSyncMode('incremental')}
                  className="text-orange-500 focus:ring-orange-500"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  增量同步
                  {lastSyncTime > 0 && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">
                      (上次: {new Date(lastSyncTime).toLocaleDateString()})
                    </span>
                  )}
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="syncMode"
                  value="full"
                  checked={syncMode === 'full'}
                  onChange={() => setSyncMode('full')}
                  className="text-orange-500 focus:ring-orange-500"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">全量同步</span>
              </label>
            </div>
            {lastSyncTime === 0 && syncMode === 'incremental' && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                首次同步将获取全部记录
              </p>
            )}
          </div>

          {/* 状态提示 */}
          {status !== 'idle' && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
              status === 'loading' ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' :
              status === 'success' ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
              'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
            }`}>
              {status === 'loading' && <Loader2 className="w-4 h-4 animate-spin" />}
              {status === 'success' && <CheckCircle className="w-4 h-4" />}
              {status === 'error' && <AlertCircle className="w-4 h-4" />}
              <span>{message}</span>
            </div>
          )}

          {/* 统计结果 */}
          {stats && status === 'success' && (
            <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="text-center">
                <div className="text-lg font-bold text-green-500">{stats.easy}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">简单</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-orange-500">{stats.medium}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">中等</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-red-500">{stats.hard}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">困难</div>
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white
                       bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
                       rounded-lg transition-colors"
          >
            关闭
          </button>
          <button
            onClick={handleSync}
            disabled={status === 'loading'}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-white
                       bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300
                       rounded-lg transition-colors"
          >
            {status === 'loading' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            同步数据
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeetCodeSyncModal;
