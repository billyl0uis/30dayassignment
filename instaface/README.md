# InstaFace

A practice social feed for older people: Instagram stories and photos meet a Facebook-style timeline, with big text and big buttons. Everything works (liking, double-tapping photos, commenting, stories, notifications, a profile), but posts never leave the device. When you share something it appears in your feed and a few "friends" react to it, but nothing is sent anywhere.

## How to use

- Open `index.html` in a browser.
- Type your name, then scroll the feed, tap a story circle, like and comment on posts.
- Write something (or add a photo) and tap **Share post**. Watch the Alerts tab for responses.
- Use the **A A A** buttons at the top to change the text size.

## What's in it

- A single self-contained HTML file with no build step. The fonts are Atkinson Hyperlegible (designed for low-vision readers) and Pacifico, loaded from Google Fonts.
- The friends, posts and stories are made up and written into the page. When you post, 2 to 4 friends like it or comment. They pick replies by looking for keywords in your post (garden, grandkids, baking, birthday, the weather, and so on), so no AI service or API key is involved. The "photos" are gradients with emoji.
- Your name, posts, likes, comments and photos are saved per browser in `localStorage`. Photos are scaled down first so they fit.
- There are no network requests apart from loading the fonts.
