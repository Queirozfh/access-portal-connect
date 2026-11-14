<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep month deletion reversible in the standalone financial HTML by retaining all records and tracking excluded months in state; revalidate settlement at confirmation so unpaid months cannot be excluded.
- Derive receivables summaries from the shared monthly stats helper so the summary and person cards use the same purchase and payment attribution.
- Each account's financial state is one app_state row keyed by its user id (the original owner keeps id 'main'); admin user management goes through /api/public/admin-users, which verifies the bearer and admin role before using the service client.
- Derive in-app access warnings from verified auth expiry metadata and the protected admin list, refreshing every minute and on focus; never write reminders into financial state.
- Keep portfolio balances and exchange-rate snapshots inside each account's existing state; daily reference quotes are not real-time market prices.
- Planned-purchase analysis reads caller-scoped persisted records, calculates amounts deterministically without double-counting bills, and streams AI commentary through a bearer-verified server route; it never creates purchases automatically.
- Complete exports serialize only the current account's financial state, never auth credentials or other accounts; CSV neutralizes spreadsheet formulas to keep exported text safe.
