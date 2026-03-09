#!/usr/bin/env python3
"""
LeetCode CN 数据爬虫
爬取用户的做题统计和提交记录，生成初始化数据
"""

import requests
import json
from datetime import datetime
import time

# LeetCode CN GraphQL API
LEETCODE_API = "https://leetcode.cn/graphql/"

# 用户名
USERNAME = "guyue-62"

# 请求头
HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": f"https://leetcode.cn/u/{USERNAME}/",
    "Origin": "https://leetcode.cn",
}


def get_user_profile(username: str) -> dict:
    """获取用户基本信息和做题统计"""
    query = """
    query userProfilePublicProfile($userSlug: String!) {
        userProfilePublicProfile(userSlug: $userSlug) {
            username
            submissionProgress {
                totalSubmissions
                waSubmissions
                acSubmissions
                reSubmissions
                otherSubmissions
                acTotal
                questionTotal
            }
        }
    }
    """

    payload = {
        "query": query,
        "variables": {"userSlug": username}
    }

    response = requests.post(LEETCODE_API, json=payload, headers=HEADERS)
    return response.json()


def get_user_solved_problems(username: str) -> dict:
    """获取用户各难度做题数"""
    query = """
    query userQuestionProgress($userSlug: String!) {
        userProfileUserQuestionProgress(userSlug: $userSlug) {
            numAcceptedQuestions {
                difficulty
                count
            }
            numFailedQuestions {
                difficulty
                count
            }
            numUntouchedQuestions {
                difficulty
                count
            }
        }
    }
    """

    payload = {
        "query": query,
        "variables": {"userSlug": username}
    }

    response = requests.post(LEETCODE_API, json=payload, headers=HEADERS)
    return response.json()


def get_recent_submissions(username: str, limit: int = 20) -> dict:
    """获取用户最近的提交记录"""
    query = """
    query recentAcSubmissions($userSlug: String!, $limit: Int) {
        recentACSubmissions(userSlug: $userSlug, limit: $limit) {
            submissionId
            submitTime
            question {
                translatedTitle
                titleSlug
                questionFrontendId
                difficulty
            }
        }
    }
    """

    payload = {
        "query": query,
        "variables": {"userSlug": username, "limit": limit}
    }

    response = requests.post(LEETCODE_API, json=payload, headers=HEADERS)
    return response.json()


def get_submission_calendar(username: str) -> dict:
    """获取用户提交日历（热力图数据）"""
    query = """
    query userProfileCalendar($userSlug: String!, $year: Int) {
        userCalendar(userSlug: $userSlug, year: $year) {
            activeYears
            streak
            totalActiveDays
            submissionCalendar
        }
    }
    """

    # 获取当前年份和去年的数据
    current_year = datetime.now().year
    results = {}

    for year in [current_year - 1, current_year]:
        payload = {
            "query": query,
            "variables": {"userSlug": username, "year": year}
        }

        response = requests.post(LEETCODE_API, json=payload, headers=HEADERS)
        data = response.json()

        if data.get("data", {}).get("userCalendar", {}).get("submissionCalendar"):
            calendar = json.loads(data["data"]["userCalendar"]["submissionCalendar"])
            results.update(calendar)

        time.sleep(0.5)  # 避免请求过快

    return results


def difficulty_to_category_id(difficulty: str) -> str:
    """将 LeetCode 难度转换为分类 ID"""
    mapping = {
        "EASY": "easy",
        "MEDIUM": "medium",
        "HARD": "hard",
    }
    return mapping.get(difficulty, "medium")


def generate_oj_data(username: str) -> dict:
    """生成 OJ 热力图数据"""
    print(f"正在爬取用户 {username} 的数据...")

    # 获取做题统计
    print("获取做题统计...")
    progress_data = get_user_solved_problems(username)

    easy_count = 0
    medium_count = 0
    hard_count = 0

    if progress_data.get("data", {}).get("userProfileUserQuestionProgress"):
        accepted = progress_data["data"]["userProfileUserQuestionProgress"]["numAcceptedQuestions"]
        for item in accepted:
            if item["difficulty"] == "EASY":
                easy_count = item["count"]
            elif item["difficulty"] == "MEDIUM":
                medium_count = item["count"]
            elif item["difficulty"] == "HARD":
                hard_count = item["count"]

    print(f"  简单: {easy_count}, 中等: {medium_count}, 困难: {hard_count}")

    # 获取最近提交记录
    print("获取最近提交记录...")
    submissions_data = get_recent_submissions(username, 100)

    submissions = []
    if submissions_data.get("data", {}).get("recentACSubmissions"):
        for sub in submissions_data["data"]["recentACSubmissions"]:
            question = sub["question"]
            submit_time = int(sub["submitTime"])
            date = datetime.fromtimestamp(submit_time)

            submission = {
                "id": f"sub_{sub['submissionId']}",
                "siteId": "leetcode",
                "categoryId": difficulty_to_category_id(question["difficulty"]),
                "problemId": question["questionFrontendId"],
                "timestamp": submit_time * 1000,  # 转为毫秒
                "date": date.strftime("%Y-%m-%d"),
            }
            submissions.append(submission)

    print(f"  获取到 {len(submissions)} 条提交记录")

    # 如果没有获取到提交记录，基于统计数据生成初始记录
    if len(submissions) == 0 and (easy_count > 0 or medium_count > 0 or hard_count > 0):
        print("  未获取到详细记录，基于统计数据生成初始记录...")
        today = datetime.now()
        base_timestamp = int(today.timestamp() * 1000)

        # 生成简单题记录
        for i in range(easy_count):
            submissions.append({
                "id": f"sub_init_easy_{i}",
                "siteId": "leetcode",
                "categoryId": "easy",
                "problemId": f"E{i+1}",
                "timestamp": base_timestamp - i * 1000,
                "date": today.strftime("%Y-%m-%d"),
            })

        # 生成中等题记录
        for i in range(medium_count):
            submissions.append({
                "id": f"sub_init_medium_{i}",
                "siteId": "leetcode",
                "categoryId": "medium",
                "problemId": f"M{i+1}",
                "timestamp": base_timestamp - (easy_count + i) * 1000,
                "date": today.strftime("%Y-%m-%d"),
            })

        # 生成困难题记录
        for i in range(hard_count):
            submissions.append({
                "id": f"sub_init_hard_{i}",
                "siteId": "leetcode",
                "categoryId": "hard",
                "problemId": f"H{i+1}",
                "timestamp": base_timestamp - (easy_count + medium_count + i) * 1000,
                "date": today.strftime("%Y-%m-%d"),
            })

        print(f"  已生成 {len(submissions)} 条初始记录")

    # 获取提交日历
    print("获取提交日历...")
    calendar = get_submission_calendar(username)
    print(f"  获取到 {len(calendar)} 天的提交数据")

    # 构建最终数据
    oj_data = {
        "sites": [
            {
                "id": "leetcode",
                "name": "LeetCode",
                "color": "#f59e0b",
                "url": "https://leetcode.cn",
                "categories": [
                    {"id": "easy", "name": "简单", "color": "#22c55e"},
                    {"id": "medium", "name": "中等", "color": "#f59e0b"},
                    {"id": "hard", "name": "困难", "color": "#ef4444"},
                ],
            },
            {
                "id": "luogu",
                "name": "洛谷",
                "color": "#22c55e",
                "url": "https://www.luogu.com.cn",
                "categories": [
                    {"id": "easy", "name": "入门", "color": "#a3e635"},
                    {"id": "normal", "name": "普及", "color": "#22c55e"},
                    {"id": "improve", "name": "提高", "color": "#14b8a6"},
                    {"id": "advanced", "name": "省选", "color": "#06b6d4"},
                ],
            },
            {
                "id": "acwing",
                "name": "AcWing",
                "color": "#3b82f6",
                "url": "https://www.acwing.com",
                "categories": [
                    {"id": "easy", "name": "简单", "color": "#22c55e"},
                    {"id": "medium", "name": "中等", "color": "#f59e0b"},
                    {"id": "hard", "name": "困难", "color": "#ef4444"},
                ],
            },
        ],
        "submissions": submissions,
    }

    return oj_data


def main():
    # 爬取数据
    oj_data = generate_oj_data(USERNAME)

    # 保存到文件
    output_path = "leetcode_data.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(oj_data, f, ensure_ascii=False, indent=2)

    print(f"\n数据已保存到 {output_path}")
    print(f"共 {len(oj_data['submissions'])} 条提交记录")

    # 统计各难度
    easy = sum(1 for s in oj_data["submissions"] if s["categoryId"] == "easy")
    medium = sum(1 for s in oj_data["submissions"] if s["categoryId"] == "medium")
    hard = sum(1 for s in oj_data["submissions"] if s["categoryId"] == "hard")
    print(f"简单: {easy}, 中等: {medium}, 困难: {hard}")


if __name__ == "__main__":
    main()
