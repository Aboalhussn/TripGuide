# Improvements noticed, NOT done

Things I think should change but that are outside "the app must look and behave exactly like the demo".
Nothing here has been implemented. Say which ones you want.

1. **Country flags on Windows browsers.** The country picker uses flag emoji (🇮🇶). Android, iOS and macOS draw them;
   Chrome and Edge on Windows show the two letters instead ("IQ"). Shipping small flag images would fix it everywhere.
2. **Real card payments need the provider's own card form.** Iraqi gateways (and card rules in general) do not allow the
   card number to pass through our server. Connecting a real provider will change the card screen (hosted fields or a redirect).
3. **Phone number proves nothing until it is verified.** Sign-up accepts any valid mobile number; verification by SMS is
   optional (the "Verify phone" button in Your info). Requiring an SMS code at sign-up would stop people registering
   numbers they do not own.
4. **The state account cannot use "forgot password"** (the demo excludes admins on purpose). Recovery today means changing
   it while signed in, or an operator resetting it. A documented recovery command would help.
5. **`GET /admin/users` searches name and email only.** Now that people sign in by phone, searching by phone would be natural.
6. **The sign-in limit message.** After 10 wrong passwords for one phone in 15 minutes the API answers `too_many_attempts`.
   The demo had no such limit; the text is new in both languages.
7. **Half-saved edits.** In the demo engine a failed call can keep part of its changes (for example `PUT /me` with a good name
   and a bad email keeps the name). The database API saves nothing when a call fails. The offline demo still has the old quirk.
   A concrete case the contract tests found: rejecting a guide without a reason answers `400` on both sides, but the demo engine
   has already marked the guide *rejected* (with no reason, and no way to approve afterwards). The API leaves the guide waiting.
   Fixing the engine's order of checks would remove this for the offline demo too.
8. **Tourists' passports and guides' photos use built-in pictures in the demo data** (`lib:` names). Real uploads go to media
   storage; nothing to do, but the demo data never exercises image hosting for those.
9. **README section 12 has small mistakes** (`GET /admin/users` uses `q`, not `query`; `promoted=1` and `status=resolved`
   filters are missing). They will be corrected when the README is rewritten in M7.
10. **The README no longer says "independent, not affiliated with any government body".** The brief says the admin side is the
    state, so that sentence was removed from the README. The same idea may still appear in the app's own texts (for example the
    policy page); those were not touched, because no screen text may change. Review them before launch.
11. **Loading less per call.** The API loads the whole marketplace per data version (see PLAN.md). Narrow loaders per endpoint are
    the main scaling work left.
12. **MinIO images.** MinIO no longer publishes its own Docker images; `docker-compose.yml` uses Chainguard's build of it.
