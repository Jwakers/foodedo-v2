# App Review information request — 11 November 2026

Apple requested a physical-device recording and six categories of review
information under Guideline 2.1. Jack confirmed a working dedicated reviewer
login exists. Keep its credentials in App Store Connect. Use a separate disposable
account for the recorded registration and deletion.

## Recording received

Jack supplied an updated recording,
`ScreenRecording_11-11-2026 10-25-28_1.MP4`, after updating the physical iPhone 11
to iOS 27.2.1. It lasts 191.69 seconds (3 minutes 12 seconds). Sampled frames
confirm launch from the iPhone Home screen, registration, recipe browsing,
planning, shopping, Safari recipe import, cooking and disposable-account
deletion returning to the signed-out welcome screen. A separate returning-user
login was not confirmed in the sampled frames.

The replacement attachment is
`tmp/app-store/review-video-updated/foodedo-ios-27-2-1-review.mp4`.
Its bytes are unchanged; the lowercase extension resolves Apple's file-type
validation. The older recording has been replaced in App Store Connect.
The revised 3,792-character Notes reference this recording, device, OS and
observed flows, alongside the purpose, access instructions, services, regional
behaviour and content-sourcing explanation. Both the attachment and notes were
verified after reloading version 1.0 → App Review Information. Existing dedicated
review credentials were preserved.

At Jack’s request, a reply was sent to App Review pointing to the updated Notes
and recording. Version 1.0 (build 2) was resubmitted on 11 November 2026 at
10:42 AM. App Store Connect confirmed **Waiting for Review** for both the
submission and app version.

Jack confirmed consistent features and catalogue across regions and
user-initiated permitted personal imports. The earlier recording was retained
locally. The latest saved Notes also exist in `tmp/app-store/review-notes.txt`.

## Recording sequence

1. Check Settings → General → Software Update on the physical device. Record the
   device model, installed OS version and submitted TestFlight build number.
2. Enable Do Not Disturb and hide notification previews. Begin screen recording
   on the iPhone Home screen, then launch Foodedo from its icon.
3. Show guest recipe browsing and a recipe's ingredients and cooking steps.
4. Register a disposable Foodedo account. Show the successful return to the app.
   Sign out, then sign in again to demonstrate returning-user login. Keep
   passwords, verification codes and unrelated personal notifications private.
5. Plan a week, keep it, swap a meal, open Shopping and check an item.
6. Paste the original sample recipe below into the recipe import flow. Show the
   AI permission prompt, completed editable result and saved recipe.
7. If demonstrating a household, use disposable accounts and explain that this
   is invitation-only sharing. Show how a member can leave the household.
8. Open profile → Manage account → Security → Delete account. Read the
   confirmation and delete only the disposable account. Show the signed-out
   result, then stop recording.

Keep the original recording. Supply it as a supported App Review attachment or
through a link Apple can open without requesting access. Put the reference in
the Notes field. Review the entire video before uploading.

## Original sample recipe

```text
Foodedo Review Tomato Toast
Serves 1. Preparation 5 minutes. Cooking 3 minutes.
Ingredients: 2 slices bread, 1 tomato, 1 teaspoon olive oil, a pinch of salt.
1. Toast the bread.
2. Chop the tomato and mix it with the olive oil and salt.
3. Spoon the tomato onto the toast and serve immediately.
```

## Notes draft

Replace every bracketed item and verify the statements against the submitted
build before saving the final notes. The rights paragraph requires a factual
owner response and supporting documentation where applicable.

```text
PHYSICAL-DEVICE DEMONSTRATION
[Recording attachment filename or accessible URL]
Recorded on [device model], running [OS version], using Foodedo [version/build]. The video starts with launching Foodedo and demonstrates guest browsing, registration, returning-user login, meal planning, shopping, recipe import and deletion of a separate disposable account.

PURPOSE AND AUDIENCE
Foodedo is a consumer meal-planning app for adults and households who want help deciding what to cook and organising their food shopping. Users choose or swap suggested dinners, save recipes and create a shopping list from their plan.

REVIEW ACCESS AND MAIN FEATURES
Use the dedicated demo credentials in the Sign-In Information fields. [Add exact sign-in steps and any review-specific instructions.] Please keep this demo account available for review. Account deletion is demonstrated with a separate disposable account in the recording.
Guests can choose Try Foodedo and browse the catalogue without signing in. To save a plan, sign in, choose Plan my week, select days and servings, generate suggestions, then keep the plan. Use the meal menu to change a meal. Shopping shows the plan's linked ingredient list. Open a recipe to view ingredients and cooking steps. Personal recipes can be created by importing a link or pasting recipe text, then reviewing and saving the result. An original sample is included below. The iOS permission prompt explains the AI processing before an import starts.
For deletion, open the profile menu, Manage account, Security, then Delete account and confirm. This removes the Foodedo account and personal live app records.

USER CONTENT AND PAYMENT
Users can save personal recipes and explicitly share recipes, plans and lists with an invitation-only household. The app has no public user-content feed, anonymous messaging or public comments. A member can leave a household. [Explain any reporting/blocking controls actually present, or describe the private-sharing model accurately for Apple's assessment.]
Foodedo is currently free. There are no subscriptions, paid features or in-app purchases.

EXTERNAL SERVICES
Clerk provides authentication, including Apple and Google sign-in. Convex provides stored app data and backend processing. Vercel hosts the website and routes AI requests to OpenAI to structure imported recipes. Apify retrieves supported Instagram/TikTok recipe source material. Source websites and supported social platforms supply content for user-requested imports. Formspree delivers support form messages. PostHog measures optional website activity and is disabled in the packaged iOS app. Sanity supplies the website's editorial blog, which is excluded from the packaged app.

REGIONS
[Confirm the intended launch territories and any regional differences. There are no deliberate regional feature switches identified in the reviewed app code. Third-party source availability can vary.]

REGULATED SERVICES AND CONTENT RIGHTS
Foodedo provides meal organisation and recipe information. [Provide relevant authorisations or licensing evidence for protected third-party material, or accurately explain the legal basis for the content used. Do not claim blanket rights without supporting evidence.]

SAMPLE FOR PASTED RECIPE IMPORT
Foodedo Review Tomato Toast. Serves 1. Prep 5 min, cook 3 min. Ingredients: 2 slices bread, 1 tomato, 1 tsp olive oil, pinch of salt. Toast bread. Chop tomato and mix with oil and salt. Spoon onto toast and serve immediately.
```

## Before resubmitting

- Verify the dedicated login from a signed-out physical-device install.
- Test on physical iPhone and iPad while both platforms are supported. Record
  what was actually tested and any unresolved failures.
- Confirm regional availability and the content-rights explanation with Jack.
- Upload the recording and complete the Notes and Sign-In Information fields.
- Check the final notes fit App Store Connect's character limit. Remove draft
  placeholders. Reply to the review request and resubmit when complete.
