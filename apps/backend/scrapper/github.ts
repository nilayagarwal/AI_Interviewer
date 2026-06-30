import axios from "axios";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export async function scrapeGithub(username: string) {
    const headers: Record<string, string> = {};
    if (GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
    }
    const userRepos = await axios.get(`https://api.github.com/users/${username}/repos`, { headers });
    return userRepos.data.map((x: any) => ({
        description: x.description,
        name: x.name,
        fullName: x.full_name,
        starCount: x.stargazers_count
    }))
}