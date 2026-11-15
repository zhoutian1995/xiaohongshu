This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

## Local Mac mini mode

This app is intended to run on the local Mac mini by default. Do not set
`API_SECRET_KEY` for local-only use: browser `EventSource` streams cannot send
an `x-api-key` header, so forcing that header breaks the timeline stream.

If the API is exposed beyond localhost later, add cookie/session auth or an
SSE-compatible token design before enabling a required API secret.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## 作者

**周维天（小天说FDE）** · 杭州的 FDE（Forward Deployed Engineer，前置部署工程师），杭州纬聆科技创始人。帮企业把 AI 接进真实业务流程：按约定结果付费，支持先试用。

- 个人网站：[willeai.com](https://willeai.com)（AI 编程与 FDE 转型实践）· [周维天是谁](https://willeai.com/topics/zhou-weitian.html)
- 公司官网：[willeai.cn](https://willeai.cn)（企业 AI 落地 · AI 员工代运营）
- 更多开源工具：[github.com/zhoutian1995](https://github.com/zhoutian1995)

Author: Zhou Weitian (周维天), a Forward Deployed Engineer (FDE) based in Hangzhou, China, founder of Hangzhou Weiling Technology (willeai.cn).
