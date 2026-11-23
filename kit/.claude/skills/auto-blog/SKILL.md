---
name: auto-blog
description: Pipeline job. Writes a launch/marketing blog post in every language from the spec and screenshots, and publishes it.
disable-model-invocation: true
---

# Blog

1. Write the English post in `automation/marketing/blog/en.md` with front matter (title, description, slug, date, images). Tell the story of the problem and how the app solves it; every feature claim cites an AC in a front-matter `claims:` list. Use screenshot paths from `fastlane/screenshots/` (or the captioned versions).
2. `reviewer` agent checks claims and tone (`automation/reviews/blog-en.md`).
3. Fan out `copywriter` agents, one per language, to write `automation/marketing/blog/<lang>.md` natively, using that language's screenshots.
4. Check every image path exists and every post has the same claims list.
5. Publish: if `app.blog.publishCommand` is set in the config, run it (it receives the folder path). If it's empty, end "blocked" asking how the owner wants it published (e.g. which CMS, and which env var holds the API token), with your recommendation.
