/**
 * Presets: Pre-configured source bundles
 * Import một preset = có ngay danh sách sources sẵn sàng dùng
 */

import { createRSSSources } from '../sources/rss.js';
import { HTMLScraperSource } from '../sources/html-scraper.js';
import { HackerNewsSource } from '../sources/hackernews.js';
import { RedditSource } from '../sources/reddit.js';
import { DevToSource } from '../sources/devto.js';

// ============================================
// 15 Big Tech Engineering Blogs
// ============================================

export function bigTechBlogs() {
  const rssBlogs = createRSSSources([
    { id: 'uber', name: 'Uber Engineering', feedUrl: 'https://www.uber.com/blog/engineering/rss/', icon: '🚗', category: 'System Design', baseUrl: 'https://uber.com' },
    { id: 'airbnb', name: 'Airbnb Tech Blog', feedUrl: 'https://medium.com/feed/airbnb-engineering', icon: '🏠', category: 'Product Engineering' },
    { id: 'meta', name: 'Meta Engineering', feedUrl: 'https://engineering.fb.com/feed/', icon: '🔵', category: 'Infrastructure' },
    { id: 'aws', name: 'AWS Architecture', feedUrl: 'https://aws.amazon.com/blogs/architecture/feed/', icon: '☁️', category: 'Cloud Architecture' },
    { id: 'netflix', name: 'Netflix TechBlog', feedUrl: 'https://netflixtechblog.com/feed', icon: '🎬', category: 'Streaming & Scale' },
    { id: 'google', name: 'Google Research', feedUrl: 'https://blog.research.google/feeds/posts/default?alt=rss', icon: '🔍', category: 'Research & Innovation' },
    { id: 'nvidia', name: 'NVIDIA Developer', feedUrl: 'https://developer.nvidia.com/blog/feed/', icon: '💚', category: 'GPU & AI Infra' },
    { id: 'slack', name: 'Slack Engineering', feedUrl: 'https://slack.engineering/feed/', icon: '💬', category: 'Distributed Systems' },
    { id: 'cloudflare', name: 'Cloudflare Blog', feedUrl: 'https://blog.cloudflare.com/tag/engineering/rss/', icon: '🟠', category: 'Internet Infra' },
    { id: 'shopify', name: 'Shopify Engineering', feedUrl: 'https://shopify.engineering/blog/feed.atom', icon: '🛒', category: 'E-commerce Scale' },
    { id: 'microsoft', name: 'Microsoft Engineering', feedUrl: 'https://devblogs.microsoft.com/engineering-at-microsoft/feed/', icon: '🪟', category: 'Enterprise Solutions' },
    { id: 'github', name: 'GitHub Engineering', feedUrl: 'https://github.blog/engineering/feed/', icon: '🐙', category: 'Developer Tools' },
  ]);

  const scraperBlogs = [
    new HTMLScraperSource({ id: 'discord', name: 'Discord Engineering', url: 'https://discord.com/category/engineering', icon: '🎮', category: 'Real-time Systems' }),
    new HTMLScraperSource({ id: 'figma', name: 'Figma Engineering', url: 'https://www.figma.com/blog/engineering/', icon: '🎨', category: 'Browser Performance' }),
    new HTMLScraperSource({ id: 'stripe', name: 'Stripe Engineering', url: 'https://stripe.com/blog/engineering', icon: '💳', category: 'Payment Systems' }),
  ];

  return [...rssBlogs, ...scraperBlogs];
}

// ============================================
// Community Sources
// ============================================

export function communitySources() {
  return [
    new HackerNewsSource({ minPoints: 100 }),
    new RedditSource({ subreddit: 'programming', minUpvotes: 200 }),
    new RedditSource({ subreddit: 'ExperiencedDevs', minUpvotes: 50 }),
    new DevToSource({ minReactions: 30 }),
  ];
}

// ============================================
// AI & ML focused
// ============================================

export function aiMLBlogs() {
  return [
    ...createRSSSources([
      { id: 'openai', name: 'OpenAI Blog', feedUrl: 'https://openai.com/blog/rss.xml', icon: '🤖', category: 'AI Research' },
      { id: 'deepmind', name: 'Google DeepMind', feedUrl: 'https://deepmind.google/blog/rss.xml', icon: '🧠', category: 'AI Research' },
      { id: 'huggingface', name: 'Hugging Face Blog', feedUrl: 'https://huggingface.co/blog/feed.xml', icon: '🤗', category: 'ML Tools' },
    ]),
    new HackerNewsSource({ query: 'AI LLM machine learning', minPoints: 80 }),
    new RedditSource({ subreddit: 'MachineLearning', minUpvotes: 100 }),
  ];
}

// ============================================
// DevOps / Platform Engineering
// ============================================

export function devopsSources() {
  return [
    ...createRSSSources([
      { id: 'cloudflare-devops', name: 'Cloudflare Blog', feedUrl: 'https://blog.cloudflare.com/tag/engineering/rss/', icon: '🟠', category: 'Edge Computing' },
      { id: 'hashicorp', name: 'HashiCorp Blog', feedUrl: 'https://www.hashicorp.com/blog/feed.xml', icon: '⬡', category: 'Infrastructure' },
    ]),
    new RedditSource({ subreddit: 'devops', minUpvotes: 50 }),
    new DevToSource({ tag: 'devops', minReactions: 20 }),
  ];
}

// ============================================
// Mobile / Android / iOS
// ============================================

export function mobileSources() {
  return [
    ...createRSSSources([
      { id: 'android-dev', name: 'Android Developers', feedUrl: 'https://feeds.feedburner.com/blogspot/hsDu', icon: '🤖', category: 'Android' },
    ]),
    new RedditSource({ subreddit: 'androiddev', minUpvotes: 50 }),
    new RedditSource({ subreddit: 'iOSProgramming', minUpvotes: 30 }),
    new DevToSource({ tag: 'mobile', minReactions: 15 }),
  ];
}
