# Parser port fidelity ledger

Generated from the `port-cashiro-parsers` workflow (2026-06-10) that ported the
original Cashiro `parser-core` Kotlin bank parsers to declarative manifests in
`lib/parser/manifests/`. Every bundle's fixtures pass `lib/parser/engine.test.ts`
(run via `bun run test`, or one file via `bun scripts/validate-manifest.ts <path>`).
`partial` means all fixtures pass but the manifest engine cannot express some Kotlin
behavior exactly — the deviation is listed under the parser.

**17 ported clean · 77 partial · 0 failed**

## adcb (`ae.adcb.bank`) — partial, 14/14 fixtures

- accountLast4: Kotlin returns the 6-digit linked account (e.g. "810001"); the engine always normalizes accountLast4 to the last 4 digits, so fixtures assert "0001".
- Multi-currency: Kotlin extractCurrency reports the transaction currency (USD/THB/EUR/GBP); the engine pins currency to the manifest's "AED", so foreign-currency fixtures omit the currency assertion and only check the numeric amount.
- ATM merchant prefixes: Kotlin builds "ATM Withdrawal: BANK123" / "ATM Deposit: LOCATION123"; the engine has no string templating, so fixtures assert the bare location ("BANK123", "LOCATION123"). Prefix stripping of "ATM-"/numeric ATM ids is reproduced via regex.
- Kotlin's month-name guard on amount currency codes (rejecting JAN..DEC as currency) is not portable; ADCB bodies never put month abbreviations in those slots.
- Regex-style skip-list entries (e.g. "transaction.\*could not be completed") are ported as their literal cores since filter.excludeKeywords is substring-based.
- Kotlin amount setScale(2) normalization is not reproduced, but all real ADCB amounts already carry 2 decimals.
- FAB base-class fallbacks ported only where reachable by ADCB formats (reference dd/dd/dd hh:mm pattern, Card No / Account last-4 fallbacks); FAB-only formats like "Debit Card Purchase" multi-line are not part of ADCB traffic and were not ported.

## adel-fi (`us.adelfi.bank`) — partial, 4/4 fixtures

- Engine collapses runs of internal whitespace in merchant names, so the Kotlin test expectation 'P AND F TAX INC CITY CAUS' is asserted as single-spaced 'P AND F TAX INC CITY CAUS' in the fixture.
- Kotlin isTransactionMessage requires BOTH 'Transaction Alert from AdelFi' AND 'had a transaction of'; engine requireAnyKeyword is OR-semantics, so the first phrase gates via filter (REJECTED) and the second via a rejectWhen pipeline step (yields REVIEW + FILTER_REJECTED reason instead of a hard null/REJECTED as in Kotlin).
- Base BankParser.extractReference (CompiledPatterns.Reference GENERIC_REF) would spuriously capture 'Alert' from 'Transaction Alert' in every AdelFi message; this junk artifact was intentionally not ported, so reference is left unextracted.
- Base balance patterns (Rs/INR-oriented) can never match AdelFi USD messages and were omitted.
- Base account-pattern fallbacks (A/c|Account|Acct, Card) were ported ahead of AdelFi's own \*\*(\d{4}) pattern in original priority order, but Kotlin's isValidAccountLast4 date/year-context validation is not expressible in the manifest format (no AdelFi message format triggers it).
- Fixture bodies for all three passing fixtures are verbatim from AdelFiParserTest.kt; the rejected OTP fixture is synthesized since the original tests had no negative case.

## airtel-payments-bank (`in.airtel.bank`) — partial, 5/5 fixtures

- No original Kotlin tests exist for AirtelPaymentsBankParser (only TanzaniaParserTest mentions Airtel Money, a different product); the 5 fixtures were synthesized from the parser's doc-comment SMS formats and regexes, including the two documented bodies verbatim.
- Kotlin quirk reproduced faithfully: for the masked-debit format ('Txn ID xxxxxxxx'), the bank-specific reference pattern rejects the masked ID but the base-class GENERIC_REF fallback then captures the literal word 'ID' as the reference; the fixture asserts reference='ID'.
- Masked-ID filtering approximated with a [0-9A-WYZ] character class (no X) instead of Kotlin's capture-then-reject-if-contains-x; differs only for partially-masked alphanumeric IDs like 'AB12x34' (engine returns 'AB12', Kotlin rejects).
- Kotlin checks all credit branches before debit ('credit' anywhere wins => INCOME even with 'debit' present); engine typeRules priority is expense>income, so this is implemented as pipeline setFieldWhen steps (INCOME when contains 'credit'; EXPENSE when contains 'debit' and not 'credit').
- Base-class super.extractMerchant CompiledPatterns.Merchant fallbacks not ported (messages lacking 'airtel payments bank' fall straight to the 'Airtel Payments Bank' merchant fallback, matching Kotlin's ?: branch when base patterns find nothing); documented Airtel formats always contain the bank name so this path is unreachable in practice.
- Base-class SmsFilter.isTransactionMessage broad-pattern final fallback not portable; filter approximated as excludeKeywords [otp, verification, request, failed] + requireAnyKeyword with the base transaction keywords ('request' subsumes the base 'has requested'/'payment request'/'collect request' skips).
- Airtel Payments Bank accounts are mobile-number based and SMS carry no account digits (Kotlin returns null accountLast4); added pipeline fallbackField accountLast4='0000' per the jiopay.ts wallet-provider rationale, plus the base A/c-mask extractor in case digits ever appear. pluginId kept as in.airtel.bank since it is a licensed payments bank.
- Verified: bun scripts/validate-manifest.ts prints 'OK in.airtel.bank: 5 fixtures pass'; bunx oxlint exits 0 with no errors.

## al-rajhi-bank (`sa.alrajhi.bank`) — ported, 9/9 fixtures

- File: /Users/vijayabaskar/work/unmiser/lib/parser/manifests/al-rajhi-bank.ts; all 8 Kotlin test SMS bodies preserved verbatim plus 1 synthesized Arabic OTP rejection fixture.
- Kotlin checks the incoming keyword واردة before expense keywords; the engine's typeRules priority tests expense first, so INCOME is set via a pipeline setFieldWhen on واردة (runs before typeRules classification) — behavior is equivalent.
- Kotlin skips merchant captures that are all '_'/digits and continues to the next pattern; the engine cannot conditionally skip, so the merchant regexes exclude '_' from their character classes ([^\n*]). This reproduces all observed behaviors, including masked 'الى:\*\*\*\*' lines falling through to 'من:SENDER'.
- Kotlin's pattern-1 ';' handling (take name after account, e.g. 'لـ\*\*\*\*; Ahmad' -> would still be rejected as masked) is not portable; in practice the Kotlin regex never matches those lines either, and the original test expects no merchant there — fixture asserts REVIEW + MISSING_MERCHANT.
- Kotlin ATM fallback merchant 'ATM Withdrawal' is ported as setFieldWhen {صراف آلي present, مكان السحب absent}; differs from Kotlin only if a صراف آلي message without مكان السحب also had a لـ/من merchant line (would be overwritten) — no such format exists in the spec.
- Kotlin detectIsCard checks مدى/بطاقة before the base-class account-keyword exclusions; the engine checks cardRules excludeKeywords first. No Arabic Al Rajhi message contains 'a/c'/'saving account', so this is unobservable; 'account' was deliberately left out of excludeKeywords (transfer bodies contain English 'ACCOUNT') since Kotlin returns true from مدى/بطاقة before exclusions anyway.
- Base-class reference and accountLast4 fallback patterns are English-keyword based and never match these Arabic messages (accounts are masked as \*\*\*\*), so no reference/accountLast4 extractors are defined; real-bank parser, no wallet 0000 fallback added.
- Two fixtures (loan installment, outgoing internal transfer) legitimately have no merchant in Kotlin (null); engine flags MISSING_MERCHANT so they assert confidence REVIEW rather than HIGH — faithful parsing, engine-level confidence semantics.
- Amounts kept as engine-emitted strings without trailing-zero normalization ('140', '1170', '7714.80'), matching the Kotlin BigDecimal inputs.

## alecu-bank (`us.alecu.bank`) — partial, 5/5 fixtures

- Kotlin isTransactionMessage requires BOTH 'alec alert' AND 'transaction from'; manifest filter.requireAnyKeyword is any-of, so the manifest gates on the more discriminating 'transaction from' only (all real ALECU alerts also contain 'ALEC Alert'). A fixture asserts the non-transaction balance alert is still FILTER_REJECTED.
- Kotlin merchant cleanup raw.split(';').first().trim() is reproduced via cleaning.stripPatterns [';.*$'] plus the engine's whitespace collapse — yields identical results for the test bodies ('WE EGIES').
- Kotlin account extraction 'account \*1=01' -> '101' (digits joined across '=') is reproduced exactly by the engine's accountLast4 digit-stripping normalization.
- super.extractAccountLast4 fallback to CompiledPatterns.Account was ported as a small US-relevant subset (account ending NNNN, a/c|acct|account ...XNNN[N]) rather than the full Indian-centric pattern list; super.extractReference/extractBalance fallbacks were not ported because ALECU messages carry no reference or balance fields.
- Two fixtures are verbatim from TestAlecuBankParser.kt (including expected merchant/accountLast4/type); the credit-variant fixture is synthesized from the parser's doc comment since no credit test existed.
- Engine adds isFromCard=false (default cardRules exclude 'account' matches every ALECU body), consistent with Kotlin detectIsCard behavior.

## alinma-bank (`sa.alinma.bank`) — ported, 5/5 fixtures

- All 4 SMS bodies from AlinmaBankParserTest.kt ported verbatim with their expected values (amounts kept as engine-produced strings: "50", "3", "125.50", "75.25"); added 1 OTP REJECTED fixture.
- Kotlin's conditional POS default merchant ("POS Transaction" only when message contains POS/نقاط البيع) is approximated with an unconditional pipeline fallbackField, since the engine has no conditional fallback; it only fires when no من:/لدى: merchant was extracted, so divergence is limited to non-POS Alinma messages lacking a merchant line.
- Kotlin canHandle uses substring contains("ALINMA")/contains("الإنماء"); ported as dltPatterns "._ALINMA._" and "._الإنماء._" plus exact senders.
- extractReference falls back to base BankParser CompiledPatterns in Kotlin; Alinma Arabic formats carry no reference and the original tests assert none, so no reference extractors were ported.
- cardRules.excludeKeywords set to [] to disable engine defaults, matching Kotlin detectIsCard which has no exclusions; includeKeywords بطاقة covers البطاقة/البطاقة الائتمانية/بطاقة مدى as a substring.
- Kotlin's isValidAccountLast4/extractLast4Digits min-3-digit rule is not enforced by the engine, but all Alinma patterns capture exactly 4 digits so behavior is identical.

## amex-bank (`in.amex.card`) — partial, 5/5 fixtures

- No original Kotlin tests exist for AMEXBankParser; 3 positive fixtures were synthesized from the parser's doc comment ('Alert: You've spent INR 1,017.70 on your AMEX card \*\* 91000 at VOUCHER PLAT on 20 August 2025') and its regexes, plus 2 REJECTED fixtures exercising the statement/membership skip-list.
- Kotlin parse() force-overrides every transaction type to CREDIT after the base parse; ported as an unconditional pipeline fallbackField (no extract/typeRules set transactionType, so it always applies). Difference: Kotlin returns null when the base extractTransactionType finds no keyword, while the manifest accepts anything passing filter.requireAnyKeyword (same keyword list), so behavior matches in practice.
- Kotlin isTransactionMessage falls back to SmsFilter.isTransactionMessage for broad pattern matching when none of the 8 base keywords match (e.g. 'charged'-only bodies); the manifest engine has no such fallback, so those edge messages are FILTER_REJECTED instead.
- Base-class isValidAccountLast4 date/year heuristics and extractLast4Digits' minimum-3-digits rule are not expressible in the manifest; takeLast4 is used instead (engine keeps captures shorter than 4 digits).
- Base-class isValidMerchantName per-pattern validation-with-fallthrough is not reproduced; the engine takes the first matching merchant extractor unconditionally. Merchant cleanup ports all CompiledPatterns.Cleaning strip patterns as cleaning.stripPatterns.
- cardRules.includeKeywords extended with 'card \*' / 'card x' so 'AMEX card \*\* 91000' sets isFromCard=true, matching Kotlin detectIsCard.
- dispatch includes a '^._AMEX._$' catch-all dltPattern to mirror Kotlin's normalizedSender.contains("AMEX") check, alongside the explicit DLT shapes.

## au-bank (`in.au.bank`) — partial, 6/6 fixtures

- Kotlin pattern 5 (to/from merchant) rejects only its FIRST regex match if it contains 'A/c'; ported as a tempered regex "(?:to|from)\s+((?:(?!A/c)[^.\n])+?)..." that can match a later to/from occurrence the Kotlin parser would never reach. Base CompiledPatterns to/from/at/for fallbacks are appended after it, reproducing Kotlin's junk merchant 'A/c 1234567890' on the 'Basic debit without UPI' fixture (the original test did not assert merchant).
- ATM merchant rule ('ATM Withdrawal' when body contains atm/withdrawn) is a pipeline setFieldWhen that overrides ANY extracted merchant; in Kotlin it ran after UPI patterns 0-3 but before the to/from fallbacks. Diverges only for a hypothetical ATM/withdrawn message that also carries a UPI/DR-style narrative.
- Kotlin checks income keywords (credited/received/deposited/refund) before expense keywords; the engine's fixed typeRules priority is expense-before-income, so an income-first setFieldWhen pipeline step (guarded by notContainsAny ['credit card']) replicates the Kotlin ordering.
- Kotlin's super.extractTransactionType investment check (groww/zerodha/sip/...) is unreachable for any message containing AU's own type keywords, so no investment typeRules were ported; a pure base-keyword message (e.g. only 'charged') would skip the investment check that Kotlin base would have run first.
- Kotlin base 'cashback' -> INCOME has an 'earn cashback' promo exception that the engine cannot express; 'cashback' is kept in income keywords without the exception.
- Engine has no per-match merchant validity check (isValidMerchantName) or accountLast4 date/year validation (isValidAccountLast4); extraction takes the first regex match unconditionally. Engine takeLast4 also has no Kotlin >=3-digits minimum.
- Kotlin isTransactionMessage's final fallback to SmsFilter.isTransactionMessage is approximated by requireAnyKeyword covering the AU-specific keywords plus the base transaction keyword list.
- Engine cleaning stripPatterns run with gi flags over the captured merchant, equivalent to Kotlin's anchored cleanMerchantName suffix strips for these patterns.
- dispatch: canHandle was a contains('AUBANK') check; ported as senders ['AUBANK'] plus dltPattern 'AUBANK' (case-insensitive substring match), matching the original handleChecks (VM-AUBANK true, AUBANK true, HDFC false).

## axis-bank (`in.axis.bank`) — partial, 9/9 fixtures

- Masked alphanumeric accounts ("A/c no. XXxxxxy") are not representable: Kotlin returns accountLast4="xxxy" (letters preserved), but the engine's takeLast4 normalization is digits-only. The A/c extractor requires digits, so such messages yield accountLast4=undefined (BURGRILL fixture asserts undefined instead of "xxxy").
- Kotlin's payment-to-card skip needs payment AND "has been received" AND "towards your axis bank" together; the manifest filter is OR-based, so only the distinctive phrase "towards your axis bank" is in excludeKeywords. A non-payment SMS containing that exact phrase would be over-rejected.
- Axis truncated-merchant fixes ("\\s+Limi$", "\\s+Pay$", "\\s+SUPE$") apply in Kotlin only inside the credit-card Spent paths; in the manifest they are global cleaning.stripPatterns, so e.g. a debit-card merchant ending in " Pay" would also be truncated.
- Kotlin's per-extractor isValidMerchantName fall-through (reject and try the next pattern) has no engine equivalent; the first non-empty extractor match wins.
- BankParser base fallbacks omitted deliberately: bare "ach" investment keyword (substring false positives like "reached"; "nach"/"ecs" kept), CompiledPatterns.Account CARD_WITH_MASK (would capture digits from "SMS BLOCKCARD XX0023" suffixes that Kotlin's Axis-specific patterns shadow) and GENERIC_ACCOUNT (engine lacks Kotlin's isValidAccountLast4 date/year rejection), and the SmsFilter broad-pattern fallback in isTransactionMessage (filter is keyword-only).
- Engine extracts creditLimit on every message rather than only when type==CREDIT as Kotlin does; harmless since the Avl Limit/Avl Lmt patterns only appear in card SMS.
- Kotlin maps Info narratives containing SALARY to merchant "Salary" only when the Info pattern matched; approximated as a setFieldWhen on containsAll ["info","salary"].
- Engine's "cashback" income keyword lacks Kotlin's "earn cashback" exclusion (promos usually caught by the "offer"/"cashback offer" filter first).
- 8 fixture bodies are verbatim from AxisBankParserTest.kt (Blinkit and RESTAURANT XY duplicates of covered formats dropped); the UPI P2A debit fixture is synthesized from the parser's upiMerchantPattern/upiRefPattern since no original test covers it.

## baac-bank (`th.baac.bank`) — ported, 6/6 fixtures

- BAACBankParser.kt is a thin subclass of BaseThailandBankParser; all extraction/type/filter logic was ported from the Thai base class plus BankParser.kt account/reference fallbacks (CompiledPatterns), in original priority order (base account patterns before the Thai 'บช xNNNN' pattern, matching super-call ordering).
- Only one original BAAC test SMS exists (Thai transfer-out, ThailandBankParsersTest.kt:371); it is preserved verbatim. The other 4 transaction fixtures are synthesized from the Thai base regexes mirroring sibling Thai bank tests (GSB deposit, UOB card transaction), plus one FILTER_REJECTED Thai OTP fixture.
- Engine compiles extractors with default 'i' flag, so the Kotlin case-sensitive amount patterns ('THB'/'USD' literals) become case-insensitive — a strictly more permissive approximation.
- Kotlin isValidAccountLast4 heuristics (rejecting dates/RRN/amount digits) have no manifest equivalent; the raw account regexes are ported without that validation.
- SMS without a merchant (typical Thai formats) parse to confidence REVIEW with MISSING_MERCHANT in the engine, whereas Kotlin returns a transaction with null merchant — fixtures assert the achievable REVIEW + correct field values.
- The inherited India-centric investment keyword list (iccl, nach, ach, groww, nse, ...) is ported verbatim for faithfulness, including its substring false-positive risk which exists identically in Kotlin.
- cardRules mirror BaseThailandBankParser.isCreditCardMessage keywords plus BankParser detectIsCard a/c-account exclusions; isFromCard is not asserted in fixtures since Kotlin tests do not assert it for BAAC.

## bancolombia (`co.bancolombia.bank`) — partial, 10/10 fixtures

- Colombian amount locale (dots = thousands, comma = decimals) is not reproducible: the engine only strips commas from amounts and has no transform/replace pipeline step, and lib/dedup-hash.ts Decimal() throws on multi-dot strings like '2.000.000' (discovered via a crash during validation).
- Approximation chosen: amounts 1.000-9.999 are extracted exactly via a takeLast4 trick that strips the single dot ('1.000' -> '1000'); plain amounts ('5000') are exact; comma centavos are dropped ('500,50' -> '500', Kotlin yields 500.50).
- Dotted amounts >= 10.000 (e.g. '2.000.000', '100.000,25') are deliberately NOT extracted: no valid decimal string is derivable and a single-dot capture would silently parse 1000x too small. These yield MISSING_AMOUNT / confidence REVIEW so they surface for manual review; Kotlin parses them exactly. 4 fixtures assert this REVIEW behavior.
- Kotlin extractMerchant returns a fixed Spanish label per verb ('Transferencia'/'Compra'/'Pago'/'Dinero recibido', else 'Bancolombia'); modeled as pipeline setFieldWhen steps in reverse Kotlin order (engine last-writer-wins == Kotlin first-match-wins) plus a fallbackField 'Bancolombia'.
- Kotlin canHandle is exact equality on senders 87400/85540, so dispatch.senders only; no dltPatterns needed.
- BankParser base-class reference/balance/accountLast4 patterns (not overridden in Kotlin) are Indian 'Rs.' formats that can never match these Spanish bodies, so they were not ported; accountLast4 is never present in Bancolombia SMS (bank parser, so no '0000' wallet fallback added).
- All 10 fixtures use the original BancolombiaParserTest.kt SMS bodies verbatim, including two FILTER_REJECTED fixtures (balance notification, promo).

## bandhan-bank (`in.bandhan.bank`) — ported, 9/9 fixtures

- Kotlin's imperative UPI merchant logic (split narration on '/', pick last segment with letters that isn't 'UPI', drop trailing standalone 'u') is approximated with a dedicated regex 'towards UPI/<dir>/<ref>/(?<value>...)' plus an optional '(?:/u)?' suffix and a '\bu\b' stripPattern; it reproduces all original test expectations but would differ on exotic multi-segment narrations.
- Kotlin normalizes merchant 'interest' -> 'Interest' (capitalization); engine cannot case-transform, so a pipeline setFieldWhen on body containing 'towards interest' sets merchant to 'Interest'.
- BankParser.isValidAccountLast4 date/year heuristics (rejecting dd/mm/yyyy and standalone-year matches) are not portable to the declarative format; account extraction relies on the masked A/c|Account|Acct patterns with takeLast4, which is safe for all known Bandhan formats.
- The compound promo skip rule (contains 'pls pay' AND 'min of') cannot be expressed in filter.excludeKeywords (substring-only); omitted. The broad SmsFilter.isTransactionMessage fallback is approximated by the requireAnyKeyword transaction-verb list.
- dispatch covers canHandle exactly: sender contains 'BANDHAN' (dltPattern 'BANDHAN' is unanchored, matching the Kotlin contains check) plus the ^[A-Z]{2}-BDNSMS(?:-S)?$ and ^[A-Z]{2}-BANDHN(?:-S)?$ DLT regexes; engine dispatch is case-insensitive like the Kotlin uppercase() comparison.
- extractCurrency override behavior is moot: manifest currency is fixed to INR, same as the parser's getCurrency().

## bangkok-bank (`th.bbl.bank`) — partial, 6/6 fixtures

- BangkokBankParser.kt only defines canHandle/getBankName; all behavior comes from BaseThailandBankParser plus BankParser fallbacks (CompiledPatterns Account/Reference), all of which were ported.
- The three real test bodies from ThailandBankParsersTest.kt have no merchant; Kotlin returns merchant=null with full parse, but the engine pushes MISSING_MERCHANT for non-TRANSFER types, so those fixtures assert confidence REVIEW with reasons [MISSING_MERCHANT] (same precedent as al-rajhi-bank.ts). Field values match the Kotlin expectations exactly.
- Engine regexes default to case-insensitive; Kotlin's THB amount patterns were case-sensitive. This is a harmless broadening (lowercase 'thb' also matches).
- Kotlin base isInvestmentTransaction has an India-centric keyword list with substring-risky tokens ('ach', 'ecs', 'kite'); ported only a safe subset (clearing corporation, mutual fund, sip purchase), matching the iob-bank.ts precedent.
- Thai-letter merchants would fail the engine's exported isValidMerchantName ([a-z] check) whereas Kotlin accepts any letter; this check is not in the engine parse path so fixtures are unaffected.
- Available limit is extracted into creditLimit, mirroring the Kotlin parse() which stores availableLimit in the creditLimit field (its own TODO).
- Two fixtures (credit card spending with merchant, PromptPay receive) are synthesized from the base parser's regexes since the original tests only cover three formats; one OTP fixture asserts FILTER_REJECTED.

## bank-muscat (`om.bankmuscat.bank`) — ported, 6/6 fixtures

- Middle merchant-ID cleanup: Kotlin replaces "-\d{4,}\s" with a space; the engine strips with empty string, so a lookahead pattern "-\\d{4,}(?=\\s)" was used to preserve the separating space — identical output.
- Engine takeLast4 has no Kotlin minimum-3-digits rule (extractLast4Digits returns null for <3 digits); for fully masked "XXXXX" the engine extractor yields empty string and skips, matching Kotlin's null in practice.
- Credit/deposit messages: the shared merchant regex (في ... بتاريخ) captures the Arabic phrase "حسابك رقم XXXXXXX9999" — the Kotlin parser exhibits the same behavior (no merchant validity check rejects Arabic letters in Kotlin), so the fixture asserts this faithful value.
- Kotlin canHandle substring checks (MUSCAT/BKMUSCAT/BANKMUSCAT/BK MUSCAT/بنك مسقط) ported as dltPatterns "MUSCAT" and "بنك مسقط" (engine tests dltPatterns case-insensitively, matching Kotlin's uppercased contains).
- Kotlin base cleanMerchantName suffix strips (PVT LTD, trailing parens, date/time/UPI suffixes) not ported; they never apply to Bank Muscat's Arabic formats.
- No transfer/payment (تم سداد) bodies exist in the original tests; credit and transfer fixtures were synthesized from the parser's doc comments and regexes.

## bank-of-baroda (`in.bob.bank`) — partial, 12/12 fixtures

- All 11 Kotlin test-case SMS bodies reproduce their original expected values exactly (amounts, merchants, accountLast4, balance, reference, type, creditLimit, isFromCard).
- Kotlin returns merchant=null for the Dr.-from, BOBCARD, credited-with-INR and Credited-to formats; the RN engine flags undefined merchant as MISSING_MERCHANT -> confidence REVIEW, so those 5 fixtures assert REVIEW instead of HIGH (engine semantics, not a parse difference).
- Kotlin's contextual merchant fallbacks (UPI Credit/UPI Payment/IMPS Transfer, pattern 4-6) only run when regex patterns 1-3 fail; ported as pipeline setFieldWhen with notContainsAny guards ('@', ' by ', 'transferred from', 'imps/'), which approximates that ordering and could differ on unusual compound messages.
- Kotlin checks BOB income keywords (cr./credited) before base expense keywords (spent/paid); engine typeRules priority is expense>income, so a message containing both 'paid' and 'cr.' would classify EXPENSE instead of INCOME (no such message in the original tests).
- Dropped the riskiest base-class investment substrings ('ach', 'nse', 'bse', 'ipo', 'kite', 'icici direct', 'coin by zerodha') to avoid false positives like 'reached'/'response'; kept the rest of the investment keyword list.
- Base-class compound filter rule (contains 'pls pay' AND 'min of') and the SmsFilter.isTransactionMessage broad fallback are not expressible in filter.excludeKeywords/requireAnyKeyword and were not ported.
- Kotlin extracts availableLimit only for CREDIT-type transactions; the engine extracts creditLimit unconditionally (harmless for these formats since the limit phrasing only appears in BOBCARD alerts).
- Kotlin cleanMerchantName ref/date/time/UPI suffix strips were approximated with trailing-parentheses, 'Total Bal...', PVT LTD/LTD, and trailing-dash stripPatterns.
- Dispatch ported as substring dltPatterns ['BOB', 'BARODA'] mirroring Kotlin contains() checks; all 11 positive canHandle senders from the Kotlin test match, and HDFC/ICICI/empty do not.

## bank-of-india (`in.boi.bank`) — partial, 8/8 fixtures

- All 3 original BankOfIndiaParserTest.kt SMS bodies preserved verbatim as fixtures (cash deposit x2, UPI debit); 3 synthesized fixtures (UPI credit, ATM withdrawal, mandate/investment) plus 2 FILTER_REJECTED fixtures ('will be' future-debit and OTP).
- Kotlin's first-match-returns type priority (cash deposit INCOME > investment > 'debited and credited to' EXPENSE > 'credited and debited from' INCOME > base keywords) is reproduced with pipeline setFieldWhen steps ordered lowest-priority-first so later steps override; base fallback lives in typeRules.
- Deviation: Kotlin returns 'ATM - <location>' for ATM withdrawals; the engine cannot prefix captured values, so the manifest extracts the bare location ('ATM MAIN ROAD NASHIK'). Fixture asserts the achievable value.
- Deviation: Kotlin lets messages with 'call ... if not done by you' + a transaction keyword bypass the OTP/promo skip-list; the engine runs excludeKeywords unconditionally before requireAnyKeyword, so a genuine transaction containing e.g. 'offer' would be rejected.
- Deviation: Kotlin base falls back to SmsFilter.isTransactionMessage for broad matching; the manifest uses a fixed requireAnyKeyword list (debited/credited/withdrawn/deposited/spent/received/transferred/paid).
- Deviation: Kotlin validates merchants via isValidMerchantName and tries later patterns on failure, and validates accountLast4 against date/year false positives; the engine takes the first regex match, so account extractors are anchored to A/c|Account|Acct keywords instead.
- Investment containsAny keywords use substring matching exactly like Kotlin contains() — including 'ach' matching inside 'Machine'; the cash-deposit INCOME override step runs after and corrects it, same as Kotlin's priority order.
- The '\s*-\s*Autopa.\*$' merchant cleanup is applied as a global cleaning.stripPattern, while Kotlin only applies it in the mandate 'towards' branch (no observed difference in practice).

## bpce (`fr.bpce.bank`) — partial, 4/4 fixtures

- French decimal comma cannot be converted to a dot by the engine (it strips commas as thousands separators), so amount extractors capture only the whole-euro part before the comma: '1000,00 EUR' parses as amount '1000' (Kotlin produced 1000.00 — numerically equal); amounts with non-zero centimes in comma format lose the centimes (e.g. 12,50 -> 12). Dot-decimal variants ('250.75 EUR') are captured losslessly via a higher-priority extractor.
- Kotlin's super.isTransactionMessage falls back to SmsFilter.isTransactionMessage broad pattern matching; the manifest approximates with the base-class keyword list plus 'virement instantané' in requireAnyKeyword, so exotic messages SmsFilter would accept may be FILTER_REJECTED here.
- Base-class investment keywords were intentionally omitted from typeRules: substring matches like 'ach' (in French 'achat') and 'nse' would misclassify French messages as INVESTMENT; the Kotlin behavior here was an accidental substring artifact.
- Base CompiledPatterns.Merchant/Reference/Account/Balance fallbacks are INR/India-centric; only generic approximations were ported (vers-pattern merchant, generic ref/account regexes, no balance extractors) since BPCE SMS never carry those fields per the Kotlin comments.
- Fixture bodies 1, 2, and 4 are verbatim from BPCEParserTest.kt; fixture 3 (dot-decimal centimes) is synthesized to cover the lossless decimal path.

## canara-bank (`in.canara.bank`) — partial, 5/5 fixtures

- No original Kotlin tests reference Canara/CANBNK, so all 5 fixtures are synthesized from CanaraBankParser.kt regexes and doc comments (UPI 'paid thru' format, 'has been DEBITED/CREDITED' ledger format, 'failed due to' and OTP rejects).
- Kotlin checks Canara positive keywords ('paid thru', 'has been debited/credited') BEFORE the base-class promo/request skip list, so e.g. a 'paid thru' SMS also containing 'offer' would parse in Kotlin but is FILTER_REJECTED here, since the engine runs excludeKeywords before requireAnyKeyword.
- Kotlin's 'Canara Bank Debit' merchant fallback (any DEBITED message where the UPI 'to X,' regex fails) is approximated with a pipeline setFieldWhen on 'has been debited', which runs after extraction; a hypothetical 'has been DEBITED ... to MERCHANT,' message would get 'Canara Bank Debit' here instead of the regex-extracted merchant (Kotlin prefers the regex). The known Canara debit format does not use that phrasing.
- Credit-format fixture asserts merchant 'your account XXX123 by NEFT from RAMESH KUMAR' — this matches Kotlin behavior exactly (its broad 'to <X>(,|.|-Canara)' pattern captures the narration and the date-suffix cleaner strips the trailing date), i.e. faithful but a low-quality merchant by design.
- Base-class isValidAccountLast4 date/year heuristics and the isValidMerchantName/common-words rejection-and-try-next-pattern loop are not expressible in the engine (extractFirst takes the first regex hit); none of the Canara formats hit those guards in the fixtures.
- extractAvailableLimit (CREDIT-type only in Kotlin) was not ported since Canara has no credit-card path and typeRules never yield CREDIT here.

## cbe-bank (`et.cbe.bank`) — partial, 7/7 fixtures

- Amount scaling: Kotlin applies BigDecimal.setScale(2) to the 'with a total of ETB250' whole-birr case (-> 250.00); the engine has no numeric transform, so the fixture asserts '250' as written in the SMS.
- Filter ordering: Kotlin CBEBankParser.isTransactionMessage checks its positive keywords BEFORE the base OTP/promo skip list (so a promo containing 'dear'/'etb' passes and only later fails amount extraction); the engine runs excludeKeywords first, so such messages are FILTER_REJECTED instead — arguably the intended behavior, and the rejected fixture asserts it.
- Masked-recipient fall-through ported via [^*] in the named-recipient regex plus a cleaning stripPattern '\\_' (Kotlin skips pattern 0 when the capture contains '_' and strips '\*' in later patterns).
- Service-charge merchant (Kotlin pattern 3, only reached when patterns 0-2 fail) is approximated with a pipeline setFieldWhen gated on containsAny ['s.charge','service charge'] and notContainsAny ['you have transfered','transferred',' to ']; for the service-charge fixture the Kotlin parser itself returns 'Service Charge' even though its original test listed merchant=null (the Kotlin test utils appear lenient on nulls).
- Reference fallback to the date-time stamp ('13/09/2025 at 12:37:24') is faithful to Kotlin and asserted in fixtures where no Ref No / id= exists; Kotlin's super.extractReference (CompiledPatterns) generic fallbacks were not ported since CBE formats never reach them.
- super.extractAmount/extractMerchant/extractBalance/extractAccountLast4 generic CompiledPatterns fallbacks not ported — the CBE-specific patterns cover all known formats; the debit-without-counterparty fixture therefore yields merchant undefined (confidence REVIEW, MISSING_MERCHANT), matching the original test's null merchant.
- Two Kotlin test files exist (CBEBankParserTest.kt and the newer TestCBEBankParser.kt with unmasked names and 2 extra cases); fixtures use the newer file's bodies verbatim, which are internally consistent.
- Engine takeLast4 returns fewer than 4 digits as-is (Kotlin requires >=3 else null) — not observable in CBE fixtures since account masks always end in 4 digits.

## central-bank-of-india (`in.cboi.bank`) — partial, 7/7 fixtures

- No original Kotlin tests reference CentralBankOfIndiaParser (grepped src/test for CentralBankOfIndia/CENTBK/CBOI); all 7 fixtures are synthesized from the parser's regexes and doc comments per the task's >=3 rule, including 2 FILTER_REJECTED fixtures.
- Balance sign: Kotlin negates 'Total Bal/Clear Bal Rs.X DR' balances; the engine cannot synthesize a minus sign, so the manifest only matches CR balances and leaves DR balances unset rather than emit a wrong positive value.
- Masked-UPI merchant: Kotlin returns 'UPI Transfer' whenever the extracted from-counterparty contains an uppercase 'X' anywhere; pipeline conditions only see the body, so this is approximated with a body check containsAny ['from x','from *'] (leading-masked ids; case-insensitive, so a lowercase name starting with x would also trigger).
- 'via UPI' fallback merchants ('UPI Credit'/'UPI Payment'): Kotlin uses these only when from/to extraction yielded nothing; the engine cannot condition on extraction outcome, so the setFieldWhen steps are guarded with notContainsAny ['from ', ' to '] as a proxy.
- Type ordering: Kotlin checks credited/deposited/received before debited/withdrawn/paid (income wins ties), while engine typeRules priority puts expense above income; reproduced faithfully via two sequential setFieldWhen pipeline steps (expense first, income second so it overwrites on ties), with typeRules retained only as the base-class fallback (investment-first, matching BankParser).
- Filter: Kotlin's CBoI isTransactionMessage short-circuits to true for 'credited by/debited by'+'bal' or '-cboi'+credited/debited BEFORE the base skip list; the engine always runs excludeKeywords first, so e.g. a genuine transaction SMS that also contains 'offer' would be rejected here but accepted by Kotlin. Also the compound base rule (pls pay AND min of) and the SmsFilter.isTransactionMessage broad fallback are not expressible and were dropped.
- Kotlin merchant regexes use [^\\s] inside raw strings (regex class excluding backslash and the letter 's' — almost certainly a bug for [^\s]); ported with the evident intent as [A-Za-z][A-Za-z0-9 ]\*? lazy up to via/Ref/./end instead of replicating the bug.
- Dispatch mirrors Kotlin contains() checks with broad DLT regexes (^._CENTBK._$, ^.*CBOI.*$, ^._CENTRAL._$); 'CENTRAL' is as over-broad as the original.
- isFromCard relies on engine defaults (Kotlin detectIsCard base logic ~matches: account/a-c keywords exclude card detection); fixtures do not assert it.

## charles-schwab (`us.schwab.bank`) — partial, 10/10 fixtures

- Dynamic currency detection is not portable: the Kotlin parser maps symbols (EUR/GBP/THB/etc.) and ISO codes ('A CAD 85.75') to a per-message currency, but the engine reports a fixed manifest currency. Foreign-currency amounts still parse correctly; the EUR and CAD fixtures assert currency USD to document this.
- The SMS body carries no merchant and the Kotlin parser returns merchant=null without penalty; the engine would flag MISSING_MERCHANT (REVIEW), so pipeline setFieldWhen steps label transactions by kind ('Debit Card Transaction', 'ATM Transaction', 'ACH Transfer') — same approach as the JioPay exemplar.
- Kotlin's conditional 'reply stop to end' skip (skip only when no transaction keyword present) cannot be expressed as an excludeKeyword; it is reproduced via requireAnyKeyword (Schwab keywords + base transaction keywords), so STOP-footer transaction alerts pass and keyword-free service messages are FILTER_REJECTED.
- cardRules.excludeKeywords is deliberately an empty array: the engine's default excludes contain 'account', which would flip every 'account ending NNNN' alert to isFromCard=false, contrary to the Kotlin detectIsCard override (debit card/ATM -> true, ACH -> false).
- extract.balance/reference/creditLimit omitted: Schwab alerts carry none, base-parser fallback patterns never match this format, and creditLimit is only extracted for CREDIT type which never occurs (all alerts are EXPENSE).
- Generic base-parser amount/account fallbacks (CompiledPatterns) were not ported; only Schwab-specific patterns plus base filter keyword fallbacks are included, in original priority order.
- Messages with only generic credit keywords ('credited', 'received') pass the filter but get no type from typeRules (expense-only, faithful to Kotlin) and would surface as REVIEW/MISSING_TYPE instead of Kotlin's null/reject.

## chase-bank (`us.chase.bank`) — partial, 5/5 fixtures

- Kotlin checks refund/'credit was posted' before expense keywords; the engine's fixed typeRules priority is expense>income, so income on refund bodies is forced via a pipeline setFieldWhen step (faithful outcome, different mechanism).
- Base-class reference extraction (CompiledPatterns.Reference.GENERIC_REF) was deliberately omitted: with case-insensitive matching it would capture the word 'with' from 'transaction with MERCHANT' as the reference (Kotlin actually does this junk extraction; omitting is the faithful-to-intent choice).
- Base-class balance patterns are Rs./INR/Rupee-symbol only and can never match Chase USD messages, so no balance extractors were ported.
- detectIsCard: Kotlin runs Chase's visa/mastercard/card-ending/credit-card check BEFORE the base account-word exclusion; modeled with cardRules.excludeKeywords: [] (empty) so 'account' in a body cannot suppress a visa match. Bodies with account words but no card keywords still resolve to false via the include list, matching the base fallback in practice.
- Base isValidMerchantName gating during extraction is approximated by the engine's extractor priority order plus cleaning.minMerchantLength 2; a generic to/from/at fallback could in rare bodies capture phrases Kotlin would also capture (same patterns), so behavior matches.
- Only one real SMS body exists in the original tests (TACO BELL Visa transaction, preserved verbatim incl. expected isFromCard=true); the other 4 fixtures are synthesized from the parser's regexes and doc comments (refund, purchase-at with card ending, charged alert, OTP rejection).

## cib-egypt (`eg.cib.bank`) — partial, 8/8 fixtures

- Engine has no per-message currency extraction: Kotlin CIBEgyptParser.extractCurrency returns EUR/USD for international transactions, but the manifest engine always reports the manifest currency EGP. Foreign-currency fixtures therefore do not assert currency.
- Amounts written without a leading zero ("with EUR .93") parse as ".93" rather than Kotlin's BigDecimal-normalized "0.93"; the refund fixture asserts ".93".
- Kotlin checks "refunded" before expense keywords; the engine's typeRules priority is expense>income, so refund classification is pinned via a pipeline setFieldWhen(containsAny ["refunded"]) -> INCOME step before typeRules run.
- cardRules.excludeKeywords set to [] to disable the engine default "account" exclusion, matching Kotlin detectIsCard which has no exclusions.
- canHandle's contains("CIB") check is ported as dltPattern "^._CIB._$", which subsumes the exact and ^[A-Z]{2}-CIB(-[A-Z])?$ checks (same over-broad behavior as the Kotlin contains check).
- BankParser base fallback extractors (Rs.-based amount/balance/reference patterns) were not ported since they are INR-centric and unreachable for CIB's EGP/USD/EUR message formats; CIB-specific patterns cover all known formats.

## cimb-thai (`th.cimb.bank`) — ported, 5/5 fixtures

- CIMBThaiParser.kt only overrides canHandle/getBankName; all extraction/classification behavior comes from BaseThailandBankParser, so the manifest mirrors the already-ported bangkok-bank.ts structure with CIMB dispatch.
- canHandle does case-insensitive contains('CIMB THAI'/'CIMBTHAI') plus exact 'CIMB'; ported as senders:['CIMB'] and dltPattern '^._CIMB\\s?THAI._$' (covers both CIMB THAI and CIMBTHAI).
- The single original test SMS ('CIMB: Transfer received 6,000.00 THB A/C x5566 Bal 14,980.00 THB') is preserved verbatim; Kotlin returns merchant=null there, which the engine reports as REVIEW/MISSING_MERCHANT rather than HIGH — fixture asserts that engine-faithful confidence.
- Kotlin isValidMerchantName extras (rejects all-digit names, names containing '@', English common words like USING/VIA) are only partially expressible via cleaning.minMerchantLength + commonWords (Thai stop words included); not exercised by fixtures.
- BankParser CompiledPatterns Account/Reference fallbacks are approximated with the same representative regexes used by the other Thai manifests (A/c|Account|Acct, Card xNNNN, Ref/Txn No), since the full compiled pattern lists are broader than any CIMB SMS format.
- Only one original test case existed; 3 additional fixtures (ATM withdrawal, Thai transfer-out, credit-card spending with merchant/available-limit) were synthesized from BaseThailandBankParser regexes, plus one OTP FILTER_REJECTED fixture.

## citi-bank (`us.citi.card`) — partial, 4/4 fixtures

- Filter ordering deviation: Kotlin CitiBankParser.isTransactionMessage checks Citi positive keywords BEFORE the base skip-list, so a Citi alert containing e.g. 'otp' would still parse in Kotlin; the engine runs excludeKeywords before requireAnyKeyword, so such messages are FILTER_REJECTED here (closest faithful approximation).
- Fixture 3 ('Alternative sender', AMAZON.COM body): Kotlin also extracts merchant=null (the [^.]+? patterns cannot cross the dot in AMAZON.COM), but the engine reports MISSING_MERCHANT and downgrades confidence to REVIEW instead of returning a merchant-less HIGH result; amounts/account/type match the original test expectations.
- Kotlin extractReference bails when the 'on ...' match is 'card ending'; replicated via a non-capturing alternation 'on\s+(?:card ending|(?<value>Month dd, yyyy))' so the first match wins without yielding a value, same as the original first-match-only semantics.
- Base BankParser amount fallbacks (Rs/INR/rupee CompiledPatterns) were not ported since this is a USD-only card parser; only the $-based Citi patterns are included.
- Base SmsFilter.isTransactionMessage broad fallback (last resort in BankParser.isTransactionMessage) is not representable in the manifest filter; requireAnyKeyword covers the Citi-specific plus base transaction keywords instead.
- Base account fallback CARD_WITH_MASK ('Card xx1234') was not ported; Citi alerts use 'card ending in NNNN' exclusively per the parser and tests.
- dispatch dltPatterns are matched case-insensitively by the engine, slightly broader than Kotlin's uppercase-only '^[A-Z]{2}-CITI-[A-Z]$' check.
- Fixture bodies 1-3 are verbatim from CitiBankParserTest.kt (including the double space in 'BP#1234E on'); the REJECTED OTP fixture is synthesized.

## city-union-bank (`in.cityunion.bank`) — partial, 5/5 fixtures

- No original Kotlin tests exist for CityUnionBankParser (grep across parser-core/src/test/kotlin found nothing), so all 5 fixtures were synthesized from the parser's doc-comment SMS formats and regexes.
- Kotlin builds dynamic merchant strings ('UPI Transfer to A/C XX<last4>', 'UPI Transfer from A/C XX<last4>', 'NEFT - <name>'); the engine cannot template extracted values into strings, so UPI merchants are static labels 'UPI Transfer to A/C' / 'UPI Transfer from A/C' / 'UPI Transfer' via setFieldWhen, and NEFT merchants are the bare counterparty name without the 'NEFT - ' prefix.
- Faithfully ported a Kotlin quirk: the type check tests all debit phrases before any credit phrase, so the 'is credited for ... and debited from a/c' UPI-credit narrative classifies as EXPENSE (reproduced via expense>income priority with plain 'debited'); fixture 2 asserts EXPENSE accordingly.
- Kotlin's 'NEFT Transfer' merchant fallback (neft trf present but the TRF: regex misses) has no engine equivalent without overwriting the extracted name; omitted since 'NEFT TRF' without a colon is not a documented format.
- Base-class investment classification (super.extractTransactionType) was intentionally omitted from typeRules: in Kotlin the CUB-specific debit/credit phrase checks run before the investment check, so adding engine investment keywords (which run at highest priority) would misclassify ordinary CUB debits mentioning broker names.
- Base CompiledPatterns fallbacks for amount/balance are approximated with one generic pattern each; base account/merchant/reference fallback pattern sets were not ported wholesale (CUB-specific patterns cover all documented formats).

## cred (`in.cred.wallet`) — partial, 7/7 fixtures

- Kotlin isTransactionMessage requires BOTH "payment of" AND "credited towards your"; the manifest filter only supports any-of, so the filter gates on the more specific "credited towards your" alone. A hypothetical message containing that phrase without "payment of" would pass here but be rejected by the Kotlin parser; all original test fixtures behave identically.
- Kotlin extractMerchant captures the card name and re-appends " Credit Card"; the engine cannot append suffixes, so the merchant regex captures through the " Credit Card" suffix, producing identical values (e.g. "ICICI Bank Credit Card").
- Original Kotlin tests expect accountLast4 = null; CRED SMS never carry account digits, so per the wallet/BNPL convention (jiopay.ts rationale) a pipeline fallbackField sets accountLast4 to "0000" and fixtures assert that value instead of null.
- extractTransactionType always returning TRANSFER is ported as a pipeline fallbackField (no typeRules), matching the Kotlin behavior exactly.
- BankParser base-class fallbacks (CompiledPatterns amount/merchant/reference) are not ported: the CRED amount regex already covers every message that passes the filter, and the merchant fallback to "CRED" is ported as a pipeline fallbackField.

## dashen-bank (`et.dashen.bank`) — partial, 5/5 fixtures

- No original Kotlin tests exist for DashenBankParser; all 5 fixtures (4 parsed + 1 FILTER_REJECTED OTP) are synthesized from the parser's regexes and doc comments.
- Kotlin checks Dashen income phrases before debit phrases; the engine's typeRules priority is expense-before-income. No real Dashen format diverges (the Telebirr debit contains both 'debited from' and 'credited to the' and classifies EXPENSE in both implementations), but a hypothetical message with 'credited with' plus a generic 'debited' word would diverge.
- Kotlin's telebirr-from merchant capture keeps a trailing space ('telebirr account number NNN '); the engine trims merchant values, so the fixture asserts the trimmed value.
- Base BankParser super.extract\* fallbacks (CompiledPatterns generic Rs/INR-oriented amount/merchant/account/balance/reference patterns) and the SmsFilter broad fallback were not ported: they are India-centric and effectively dead code for an ETB-only bank; requireAnyKeyword uses the base transaction-keyword list as the closest approximation.
- Base investment-keyword classification (Groww/Zerodha/NSE etc.) omitted as irrelevant to Ethiopian senders.
- Kotlin parseScaledAmount setScale(2, HALF_UP) is not reproducible in the engine (string passthrough); fixtures use amounts that already carry two decimals so expected values match.

## dbs-bank (`in.dbs.bank`) — partial, 6/6 fixtures

- No original Kotlin tests exist for DBSBankParser; all 6 fixtures (4 parsed, 2 FILTER_REJECTED) are synthesized from the parser's regexes and doc comments ('debited with INR 11', 'account no **\*\*\*\***1234', 'Current Balance is INR37888.45').
- pluginId is in.dbs.bank (currency INR, country IN): the Kotlin parser targets DBS Bank India/digibank traffic with Indian DLT headers, despite the Singapore parent bank.
- Kotlin canHandle uses contains('DBSBNK')/contains('DBS'); ported as unanchored dltPatterns 'DBSBNK' and 'DBS' alongside the three exact DLT regexes — equally broad as the original (any sender containing DBS matches).
- DBS's type override (debited/credited/withdrawn/deposited checked BEFORE base investment detection) is replicated via pipeline setFieldWhen steps (income first, expense second so last-write-wins reproduces Kotlin's debited-beats-credited); typeRules carry only the super-fallback keywords incl. investment list. Edge deviation: a body containing both 'credited' and 'withdrawn' yields EXPENSE here but INCOME in Kotlin (credited is checked before withdrawn there).
- Base isTransactionMessage's compound skip rule (contains 'pls pay' AND 'min of') and its final SmsFilter.isTransactionMessage broad fallback are not expressible in the manifest filter; requireAnyKeyword is limited to the 8 explicit transaction keywords.
- Base income keyword 'cashback' (with the 'earn cashback' negative guard) omitted — the guard is not expressible and including it bare would misclassify promos; 'offer'/'discount' excludes cover most promo cases.
- Base CompiledPatterns.Account GENERIC_ACCOUNT third fallback and the isValidAccountLast4 date/year heuristics are not ported (engine has no validation hook); AC_WITH_MASK + Card patterns with takeLast4 cover the realistic DBS formats.
- Engine cleaning runs stripPatterns with gi (Kotlin replaces once, case per-pattern) — no observable difference on the ported patterns.

## dhanlaxmi-bank (`in.dhanlaxmi.bank`) — partial, 8/8 fixtures

- All 5 positive SMS bodies and 3 negative cases come verbatim from DhanlaxmiBankParserTest.kt; expected values match the Kotlin test expectations (amounts/balances comma-normalized).
- Kotlin extractTransactionType when-order (is debited > is credited > debited from > credited to > credited for) is replicated via reverse-priority setFieldWhen pipeline steps (last write wins); verified correct for the internal-transfer case that contains both 'is credited for' and 'debited from a/c' (yields INCOME).
- fallbackField merchant 'UPI Payment' is unconditional in the engine, whereas Kotlin only returns 'UPI Payment' when the body contains 'UPI TXN' and otherwise falls through to base merchant patterns/null. A non-UPI Dhanlaxmi message with no extractable merchant would get 'UPI Payment' here instead of MISSING_MERCHANT.
- Merchant extractors 'Payment from'/'payment on' are not gated on 'UPI TXN' presence (Kotlin gates them inside the UPI branch); in practice these phrases only occur in UPI narratives.
- Filter ordering deviation: Kotlin checks Dhanlaxmi-specific transaction keywords BEFORE the base promo/request/due skip lists, while the engine runs excludeKeywords before requireAnyKeyword. A message containing both a Dhanlaxmi keyword and e.g. 'offer' would parse in Kotlin but be FILTER_REJECTED here.
- Base BankParser's broad SmsFilter.isTransactionMessage fallback was not ported; requireAnyKeyword covers the explicit base keyword list (debited/credited/withdrawn/deposited/spent/received/transferred/paid) plus Dhanlaxmi-specific phrases.
- Kotlin isValidMerchantName validation (length/@-VPA/common-word checks) is not applied at extract time by the engine; fixture merchants are unaffected.
- Reference values asserted in fixtures (UPI Ref no / 'UPI TXN: /<digits>') follow the parser's extractReference patterns; the original tests did not assert reference.

## discover-card (`us.discover.card`) — partial, 5/5 fixtures

- Fixture bodies are taken verbatim from DiscoverCardParserTest.kt (4 cases) plus one synthesized REJECTED OTP fixture.
- Kotlin's conditional STOP-message skip (reject 'text stop to end' unless body contains 'transaction of') is not expressible as a flat exclude list, since every real Discover alert ends with 'Text STOP to end'. Approximated via requireAnyKeyword: a STOP-only message without any transaction/Discover keyword is still rejected; a non-transaction message containing 'no action needed' or the app.discover.com link would pass the filter but then fail with MISSING_AMOUNT (REVIEW) instead of being rejected outright.
- Kotlin checks Discover positive keywords before the base promotional skip-list, so excludeKeywords here are kept to the OTP family only ('offer'/'discount' omitted) to preserve that priority; a promo message containing 'transaction of' parses in both implementations.
- Base BankParser INR amount/balance fallback patterns (Rs./INR) were not ported — irrelevant for a USD card; balance extraction omitted because Discover alerts carry none.
- Discover alerts contain no card/account last-4; generic base account fallbacks are included but normally never fire, and no '0000' wallet fallback is added (real card issuer).
- Kotlin's merchant validation rejecting a captured value that looks like a date (\w+ \d{1,2}, \d{4}) has no engine equivalent; the 'at ... (on|Text|$)' extractor stops before ' on <date>' so this guard is not needed for known formats.

## dop-bank (`in.dop.bank`) — partial, 4/4 fixtures

- Kotlin isTransactionMessage requires (account|a/c|dop) AND (credit|debit); the manifest filter expresses only one OR group, so requireAnyKeyword keeps the discriminating half [credit, debit] — the other conjunct is effectively guaranteed by DOP-only sender dispatch.
- Kotlin checks 'credit' before 'debit' (credit wins when both appear) but the engine typeRules priority is expense>income, so the ordering is replicated with pipeline setFieldWhen steps (credit -> INCOME, then debit-without-credit -> EXPENSE); typeRules keep only the base-parser fallback keywords.
- DOP messages carry no merchant and the Kotlin parser returns merchant=null on a successful parse; the engine flags MISSING_MERCHANT, so passing fixtures assert confidence REVIEW with reasons [MISSING_MERCHANT] rather than fabricating a merchant (real bank, so no wallet-style fallbackField).
- Kotlin's NFKD Unicode normalization / non-ASCII stripping for RCS messages is not portable to the declarative engine; all known DOP bodies are ASCII so fixtures are unaffected.
- Original tests contain 7 near-identical credit messages (one format); kept 2 verbatim bodies (distinct DLT senders), synthesized one DEBIT variant of the same format, and added an OTP FILTER_REJECTED fixture.
- Base BankParser CompiledPatterns fallback chains are condensed to one generic Rs/INR amount pattern and one a/c account fallback since the DOP-specific patterns always fire first for this format.

## emirates-nbd (`ae.emiratesnbd.bank`) — partial, 9/9 fixtures

- UAEBankParser.extractCurrency() picks the per-SMS currency (USD/EUR/GBP); the engine always reports the static manifest currency AED, so multi-currency fixtures do not assert currency. This is the main unportable behavior.
- Kotlin's month-abbreviation guard on the currency token (isMonthAbbreviation with return@let retry) is approximated with a negative lookahead (?!JAN|FEB|...) inside the amount regexes.
- Kotlin extracts available limit only when type==CREDIT; the engine extracts creditLimit whenever the pattern matches (harmless for these formats).
- Kotlin checks income keywords (credited/deposited/refund/cashback/received) before the purchase-of+credit-card -> CREDIT combo; engine typeRules priority is credit>expense>income, so this ordering is reproduced with ordered pipeline setFieldWhen steps plus a notContainsAny guard.
- Account debit/credit SMS formats carry no merchant in Kotlin either (returns null); fixtures for those assert confidence REVIEW with reasons [MISSING_MERCHANT], matching engine semantics.
- Kotlin canHandle() strips whitespace before contains(); approximated with dltPatterns ENBD and EMIRATES\s\*NB (substring, case-insensitive).
- EmiratesNBDParser.isTransactionMessage() has only positive keyword checks (no OTP/promo skip-list), so filter has requireAnyKeyword only; the REJECTED fixture is an OTP body lacking all required keywords. An OTP that mentions 'purchase of' would parse — same as the Kotlin source.
- BankParser super extractAccountLast4 (CompiledPatterns.Account) is approximated with a generic a/c|account|acct masked-digits pattern ahead of the parser's own 'ending NNNN' and 'xxxxNNNN' patterns; super's date/year validity heuristics are not ported (no fixture needs them).
- extractReference is not overridden in Kotlin and no test asserts it, so no reference extractors were ported.
- cleanMerchantName's CompiledPatterns.Cleaning suffixes are approximated with stripPatterns for trailing parentheses, Ref No suffix, PVT LTD/LTD, and trailing dashes/whitespace.

## equitas-bank (`in.equitas.bank`) — ported, 5/5 fixtures

- No original Kotlin tests exist for EquitasBankParser (grep over parser-core/src/test found nothing), so all 5 fixtures are synthesized from the parser's regexes and message format implied by its patterns.
- Kotlin guards the dated to/from merchant patterns with separate isDebit/isCredit booleans; ported as a 'debited[\s\S]_?...' / 'credited[\s\S]_?...' regex prefix, which additionally assumes the keyword appears before the dated clause (true for the Equitas format).
- Kotlin returns 'UPI Transaction' for 'via UPI' only after the dated to/from patterns fail; the manifest uses a setFieldWhen pipeline step that unconditionally overwrites the merchant when 'via UPI' is present, so a message containing both a dated 'to <merchant>' clause AND 'via UPI' would deviate (engine: 'UPI Transaction', Kotlin: the dated merchant). The setFieldWhen correctly outranks the generic super fallback patterns, matching Kotlin priority for all common formats.
- extractTransactionType precedence (debited > credited > withdrawn > deposited, checked BEFORE the base-class investment keywords) is reproduced exactly via guarded setFieldWhen pipeline steps; the engine's fixed investment-first typeRules priority therefore only applies to the super fallback path (transferred/received/paid messages), matching Kotlin.
- Base-class isValidAccountLast4 date/year rejection and isValidMerchantName VPA/@ rejection have no engine equivalent; account patterns rely on takeLast4 only, and invalid merchants are not skipped to try later patterns. No fixture depends on these validators.
- Kotlin extractLast4Digits returns null when fewer than 3 digits are captured; engine takeLast4 keeps 1-2 digit captures. Not exercised by fixtures.
- Kotlin cashback rule excludes 'earn cashback'; typeRules cannot express negation, so 'cashback' is included unconditionally (marketing messages are filtered out by the 'offer'/'discount' excludeKeywords anyway).
- Filter excludeKeywords drop 'cashback offer' as redundant since 'offer' already covers it (same contains semantics as Kotlin).

## everest-bank (`np.everest.bank`) — partial, 9/9 fixtures

- Filter ordering deviation: Kotlin checks Everest-specific positive keywords BEFORE the base skip-list, so real alerts ending in 'Never Share Password/OTP' parse. The engine runs excludeKeywords first, so 'otp'/'verification code' were intentionally omitted from excludeKeywords; an actual OTP message from an Everest sender containing 'npr'/'dear customer' would pass the filter but then likely land in REVIEW (no amount/type), same practical outcome as Kotlin.
- Fonepay merchant: Kotlin builds 'Fonepay <TYPE>' dynamically from 'FPY:<TYPE>:...'. The declarative format cannot prepend strings, so a setFieldWhen handles the only observed type ('For: FPY:IBFT' -> 'Fonepay IBFT'); other FPY types would fall through to the simple For: extractor and yield the raw FPY content.
- Kotlin's last-resort merchant fallback (iterate all slash/comma parts skipping numerics and 'UJJ SH') is approximated by three ordered extractors (slash payment-type with letter requirement, after-comma receiver with (?!UJJ SH) lookahead, simple For: content); the full iterate-all-parts loop is not expressible.
- Kotlin returns 'Fonepay Transfer' when FPY has no type part, and skips accountLast4 when the literal placeholder '{Account}' appears -- both untestable template edge cases, not ported.
- canHandle numeric-sender rule ported as dltPattern '^\\d{7,10}$' and contains('EVERESTBANK')/contains('EBL') as substring regexes, matching Kotlin semantics including EBL_ALERT.
- Base BankParser super.extractAmount/Reference fallbacks (CompiledPatterns generic Rs./Ref patterns) not ported -- all Everest formats are covered by the NPR and For:-section extractors; generic base transaction keywords were folded into filter.requireAnyKeyword.
- All 8 SMS bodies and expected values come verbatim from EverestBankParserTest.kt / TestEverestBankParser.kt; engine additionally extracts a reference for the EBL_ALERT ATM fixture (Kotlin test did not assert one) which the fixture's partial expectations tolerate.

## fab (`ae.fab.bank`) — partial, 15/15 fixtures

- currency is always the manifest currency AED; the Kotlin parser extracted per-transaction currency (THB/USD) from the body — fixtures with THB/USD bodies report AED
- merchant whitespace is collapsed by the engine cleaner, so 'TR DUBAI ARE' becomes 'TR DUBAI ARE' (Kotlin preserved raw spacing)
- transfer/payment-instruction merchants are the static 'Transfer' — the engine cannot compose Kotlin's dynamic 'Transfer: 003 -> 002' / 'Transfer to <digits>' strings from two captures
- Kotlin's promotional-message conditional (bit.ly/'conditions apply' rejected unless purchase/payment/remittance present) approximated via requireAnyKeyword only; generic credit/debit/remittance branch lacks Kotlin's amount-pattern requirement, so the filter is slightly more permissive
- Kotlin asterisk-masked amount/balance handling ported partially: leading-asterisk numeric forms (AED \*50.00, \*\*\*0.00) parse; fully-masked amounts fall through differently
- regex exclude keyword 'debit card.\*replacement request' ported as substring 'replacement request' (also covers 'replacement request has been registered')
- BankParser base-class super.\* fallbacks (Rs.-centric INR amount/balance/account patterns, generic debited/credited type ladder) omitted as unreachable for AED FAB messages; base typeRules keywords folded into typeRules where relevant
- creditLimit not extracted: FAB messages have no AED available-limit pattern and the base extractAvailableLimit patterns are Rs.-only; original tests never assert it
- fixture bodies taken verbatim from FABParserTest.kt (one per distinct format, duplicates of the same format skipped); OTP rejected fixture exercises filter.excludeKeywords

## faysal-bank (`pk.faysal.bank`) — partial, 8/8 fixtures

- Dot-as-thousands amounts (Pakistani app-notification format, e.g. 'PKR 55.000.00' = 55000.00): Kotlin collapses all but the last dot; the engine only strips commas and a multi-dot string crashes the Decimal dedup hash, so the amount extractor deliberately rejects this format. Such messages parse with no amount -> REVIEW + MISSING_AMOUNT instead of amount 55000.00 (fixture 'outgoing IBFT with dot-thousands amount' asserts this). Comma-grouped and plain amounts are normalized faithfully.
- Kotlin isTransactionMessage requires 'pkr' AND a transfer keyword; the filter schema can only express the keyword OR-list (requireAnyKeyword). A non-PKR body containing a keyword falls through to MISSING_AMOUNT/REVIEW instead of REJECTED.
- Kotlin extractAccountLast4 takes matches.last() per pattern; emulated with a greedy [\s\S]\* prefix on each account regex (verified by the two-FBL-accounts fixture picking 4388).
- canHandle's space-stripped contains() checks ported as dltPatterns FAYSAL/FBL/^8756$ (case-insensitive contains); a sender with spaces inside the token (e.g. 'F B L') would not match — considered unrealistic.
- Base-class isInvestmentTransaction (India-specific keywords: groww, zerodha, nse...) intentionally not ported for this Pakistani bank to avoid false positives; no Faysal test exercises it.
- Kotlin strips '\*' and ',' only from card-purchase merchants; cleaning.stripPatterns applies them to all merchants (harmless for the observed formats). Base cleanMerchantName's PVT LTD/LTD suffix strips are ported; its other suffix strips (trailing parentheses/date/UPI/time) are not, as no Faysal format produces them.
- Kotlin's isValidMerchantName gating on the received-from patterns has no engine equivalent during extraction; extractor ordering makes the observed formats yield the same merchants.
- cardRules.excludeKeywords set to [] because every Faysal SMS contains 'A/C' which the engine's default exclusions would treat as not-a-card; Kotlin's override returns isFromCard=true for 'debit card purchase' before the base a/c exclusion runs.
- All 7 distinct SMS formats from FaysalBankParserTest.kt are preserved verbatim as fixtures (two duplicate-format test cases skipped), plus one synthesized OTP FILTER_REJECTED fixture (Kotlin has no explicit skip-list, but OTP bodies fail its transfer-keyword requirement).

## federal-bank (`in.federal.bank`) — partial, 17/17 fixtures

- All 13 real SMS bodies from FederalBankParserTest.kt + TestFederalBankMandateParsing.kt preserved verbatim with their expected values; ATM withdrawal fixture synthesized from parser patterns (no original test).
- parseUPIMerchant() VPA lookup table approximated with pipeline setFieldWhen body-substring steps in reverse Kotlin priority (later step overrides), so brand keywords match anywhere in the body, not just the VPA local part; payment apps (paytm/phonepe/gpay/bharatpe) guarded with 'vpa <brand>' prefix to avoid matching VPA domains like @paytm. Subset of ~20 brands ported, not the full table.
- Digits-only VPA -> 'Individual' mapping not portable (conditions are substring-only, no regex); such VPAs fall through to the raw VPA string.
- 'It was sent by <short/zero sender>' -> 'Bank Transfer' only handled for the literal 'sent by 0000' (Kotlin also maps any ^0+$ or length<=4 sender).
- Kotlin only extracts available limit for CREDIT-type transactions; the engine extracts creditLimit unconditionally. Likewise isFromCard uses cardRules include/exclude keywords instead of Kotlin's ordered when-chain (excludes evaluated first), which could differ for messages mixing card and UPI/account tokens.
- Kotlin checks investment keywords only in the super fallback (after debited/credited); engine typeRules put investment at highest priority, so investment typeRules were omitted entirely to stay faithful to FederalBankParser's order.
- E-mandate merchant 'Netflix via e-mandate ID: NX789XYZABC' reproduced via a dedicated extractor (in Kotlin this value actually emerges from base-class fallback patterns since its own e-mandate regex cannot match across the '.' in the amount).
- Mandate-creation/payment-due messages are filter-rejected (FILTER_REJECTED) like the Kotlin transaction path; the separate parseEMandateSubscription/parseFutureDebit subscription-info APIs have no manifest equivalent and were not ported.
- ATM merchant override (setFieldWhen containsAny atm/withdrawn, notContainsAny card) can override an extracted 'at X on <date>' merchant for non-card ATM messages, matching Kotlin's priority for ATM but slightly broader.
- canHandle contains() checks subsume the explicit DLT regexes, so dispatch uses four contains-style dltPatterns (FEDBNK/FEDERAL/FEDFIB/FEDSCP).

## gsb-bank (`th.gsb.bank`) — ported, 6/6 fixtures

- GSBBankParser.kt is a thin subclass of BaseThailandBankParser overriding only canHandle; all extraction/type/filter logic was ported from the Thai base class plus BankParser.kt CompiledPatterns fallbacks, mirroring the already-ported baac-bank.ts structure.
- Both original Kotlin test SMS bodies (GSB deposit and GSB withdrawal) are preserved verbatim as fixtures with their expected amounts/types/last4/balance.
- Engine marks merchant-less Thai messages as REVIEW with MISSING_MERCHANT, whereas the Kotlin parser returns a transaction with merchant=null without any confidence downgrade; fixtures assert the engine's REVIEW behavior. Field values themselves are identical to the Kotlin expectations.
- Kotlin canHandle uses exact 'GSB' plus uppercase contains('GOVERNMENT SAVINGS')/('GOVT SAVINGS'); ported as senders:['GSB'] plus dltPatterns ^._GOVERNMENT SAVINGS._$ and ^._GOVT SAVINGS._$ (same approximation used by the BAAC exemplar).
- India-centric investment keyword list is inherited verbatim by the Thai base class in Kotlin, so it is kept in typeRules.investment for faithfulness.

## hdfc-mutual-fund (`in.hdfcmf.bank`) — ported, 5/5 fixtures

- No original Kotlin tests exist for HDFCMutualFundParser (grepped src/test for HDFCMF/Mutual Fund); all 5 fixtures are synthesized from the parser's regexes and doc comments.
- Kotlin extractBalance/extractAccountLast4 always return null (MF SMS carry a folio, not a bank account); manifest defines no extractors for them and no accountLast4 '0000' fallback since this is a fund house, not a wallet provider.
- Amount extractor uses flags '' to preserve Kotlin's case-sensitive Rs pattern; merchant pattern keeps the engine's default 'i' flag matching Kotlin's IGNORE_CASE.
- Kotlin returns null merchant when the 'under <scheme> for' phrase is absent; in the engine this surfaces as REVIEW + MISSING_MERCHANT, asserted by the 'redemption without scheme phrase' fixture.
- Faithfully preserved quirk: the amount regex takes the FIRST 'Rs...' occurrence, so a message where NAV precedes the amount would capture the NAV (identical to Kotlin behavior).
- typeRules investment:['purchase'] + income:['redemption'] reproduce the Kotlin when-order via the engine's investment>income priority; 'sip purchase' is covered by the 'purchase' substring.

## hsbc-bank (`in.hsbc.bank`) — partial, 6/6 fixtures

- accountLast4 zero-padding not portable: Kotlin pads 'A/c 074-260\*\*\*-006' to '0006'; engine takeLast4 keeps digits-only without padding, fixtures assert '006' (and '789' for the second NEFT format).
- Masked card suffix not portable: Kotlin returns '71xx' for 'Debit Card XXXXX71xx'; engine strips non-digits from accountLast4, fixture asserts '71'.
- Kotlin isTransactionMessage runs HSBC positive checks after only the OTP skip-list, then falls back to the base skip-list; engine runs ALL excludeKeywords before requireAnyKeyword, so a transactional SMS containing a base skip word (e.g. 'offer', 'is due') would be rejected where Kotlin would accept it.
- Kotlin filter has compound checks (creditcard AND 'used at', 'inr' AND 'account'); engine requireAnyKeyword is OR-only, approximated with 'used at' / 'thank you for using' plus the base transaction keywords; the bare 'inr'+'account' branch is not ported (covered by other keywords in practice).
- Engine typeRules check investment before HSBC's card-specific branches, so a credit/debit card txn mentioning an investment keyword (e.g. ZERODHA) classifies INVESTMENT where Kotlin would return CREDIT/EXPENSE.
- Kotlin validates merchant candidates (isValidMerchantName) and falls through to the next pattern on failure; engine stops at the first regex match — extractor order preserves all original test outcomes but edge cases where an early pattern matches an invalid candidate (e.g. 'at 06.33.02') rely on a more specific prior extractor matching first.
- All 5 SMS bodies from HSBCBankParserTest.kt preserved verbatim; added 1 synthesized OTP REJECTED fixture.

## huntington-bank (`us.huntington.bank`) — partial, 8/8 fixtures

- Negative balance: Kotlin produced "-15.01" from "has a -$15.01 bal"; a single capture group cannot bridge the "$" between sign and digits, so the engine yields "-$15.01" (sign and magnitude preserved, "$" retained). Fixture asserts "-$15.01".
- Kotlin rejects any "heads up" message lacking "withdrawal" before keyword checks; the manifest approximates this via requireAnyKeyword, so a hypothetical "Heads Up" message containing a base keyword (e.g. "received") would pass here but be rejected by Kotlin. All real Huntington formats contain "withdrawal", so fixtures are unaffected.
- Base-class investment keywords (including "ach") were intentionally omitted from typeRules: the engine prioritizes investment over expense, which would misclassify "ACH withdrawal" as INVESTMENT, whereas the Kotlin override checks "withdrawal" -> EXPENSE first (confirmed by original tests).
- Amount has a generic "$X" fallback approximating super.extractAmount (the Kotlin base patterns are Rs/INR-centric and would effectively never match USD bodies).
- extract.reference omitted: Kotlin falls back to base-class Indian-format reference patterns that never match Huntington messages; original tests assert no reference.
- All 7 original HuntingtonBankParserTest SMS bodies are preserved verbatim with their expected amounts, merchants, accountLast4, balances, types, and isFromCard values; the 8th fixture is a synthesized "Heads Up" balance alert asserting FILTER_REJECTED.

## icici-bank (`in.icici.bank`) — partial, 14/14 fixtures

- Multi-currency support is unportable: Kotlin extracts dynamic currency from 'USD 11.80 spent' formats, but the engine fixes fields.currency to the manifest currency (INR). USD/EUR fixtures keep the original test bodies and amounts but omit currency assertions.
- Kotlin appends ' Dividend' to ACH/NACH merchant names and maps AutoPay services to canonical labels ('Google Play Store', 'AutoPay Subscription'); the engine cannot transform extracted values, so the ACH extractor returns the bare company name and the AutoPay fallback extractor yields literal 'AutoPay'. No original tests covered these branches.
- Kotlin skips cash-deposit duplicates only when both 'cash deposit transaction' AND 'has been completed' are present; filter.excludeKeywords are single substrings, so 'cash deposit transaction' alone rejects (the actual credit notification uses the 'credited:Rs.' + 'Info BY CASH' format, so no real loss).
- creditLimit patterns (base extractAvailableLimit) run for every message in the engine, not only CREDIT-typed ones as in Kotlin. Note the original test card messages use 'Avl Limit: INR ...' which neither Kotlin nor this port captures (patterns require 'Rs').
- Base GENERIC_ACCOUNT fallback was tightened to require 3+ digits ((?:A/c|Account).\*?(\d{3,})(?:\s|$)) to emulate Kotlin's extractLast4Digits >=3-digit guard; like Kotlin, it can latch onto reference digits (e.g. 'Reference: TXN123456789' yields accountLast4 '6789') — the original test does not assert accountLast4 there; the fixture asserts the actual achievable value... wait, it asserts only amount/reference/type, accountLast4 not asserted in that fixture.
- Kotlin's isValidMerchantName/isValidAccountLast4 runtime validations (common-word rejection, date/year context checks) are not enforced by the engine at extract time; no fixture depends on them.
- Messages Kotlin parses with merchant=null (e.g. 'Rs. 1,000.00 has been debited from your account XX456 for bill payment') come out as confidence REVIEW with MISSING_MERCHANT in the engine; fixtures assert REVIEW accordingly.
- Credit-card CREDIT classification and 'Info BY CASH'/salary merchant overrides are ported as pipeline setFieldWhen steps ordered so credit-card wins, matching Kotlin's check order; salary override uses containsAll ['Info INF*',' SAL'] as a substring approximation of the Kotlin regex Info\s+INF\*[^*]+\*[^*]\*SAL.
- Dispatch uses dltPattern '^._ICICI._$' since Kotlin canHandle accepts any sender containing 'ICICI', which subsumes all its specific DLT regexes.
- Fixture bodies are verbatim from ICICIBankParserTest.kt (11 cases incl. 4 rejections) plus one synthesized cash-deposit-completed rejection from the parser doc comment and the two UPI 'merchant credited' test bodies.

## idbi-bank (`in.idbi.bank`) — partial, 6/6 fixtures

- No original Kotlin tests exist for IDBIBankParser (grepped parser-core/src/test for IDBI — zero hits), so all 6 fixtures are synthesized from the parser's regexes and doc comments (e.g. 'debited with Rs 59.00', 'IDBI Bank Acct XX1234 debited for Rs 1040.00', RRN/UPI: refs, 'Bal Rs 3694.38').
- BankParser.isTransactionMessage final fallback to SmsFilter.isTransactionMessage (broad pattern matching) is approximated by filter.requireAnyKeyword with the 8 transaction keywords only; messages that only SmsFilter would accept will be FILTER_REJECTED.
- Kotlin's compound skip (lowerMessage contains 'pls pay' AND 'min of') cannot be expressed in filter.excludeKeywords (no AND semantics); omitted. The other due-reminder keywords ('is due', 'min amount due', 'ignore if paid', etc.) cover the realistic cases.
- Kotlin isValidAccountLast4 date/year rejection heuristics and isValidMerchantName validation (which lets the Kotlin parser fall through to the next merchant pattern) have no engine equivalent — the engine takes the first regex match. Fixture bodies were checked against this first-match semantics.
- typeRules income includes 'cashback' without Kotlin's '!contains("earn cashback")' negation; mitigated because 'offer'/'cashback offer' are filter excludes.
- Investment keyword list intentionally drops the highest-collision short substrings from BankParser.isInvestmentTransaction ('ach', 'ecs', 'sip', 'elss', 'ipo', 'nse', 'bse', 'folio', 'kite') to avoid false INVESTMENT classification on ordinary words (e.g. 'reach', 'recharge'); kept 'nach' and all platform/exchange names. Kotlin has the same substring false-positive risk but priority order makes it bite harder in the engine.
- extractAvailableLimit (creditLimit) fallbacks not ported since IDBI has no CREDIT-card limit format in its parser; engine only extracts creditLimit if configured.
- IDBI merchant pattern 3 (AutoPay 'towards X for \\w\*MANDATE') is subsumed by pattern 1 ('towards X for'), matched first in both Kotlin and the manifest; documented in a comment rather than duplicated.

## idfc-first-bank (`in.idfcfirst.bank`) — partial, 8/8 fixtures

- Currency deviation: Kotlin extracts dynamic currency (EUR/USD/GBP ... spent) for foreign credit-card transactions; the manifest engine always reports manifest currency, so card fixtures parse with currency INR (amount/merchant/last4 still faithful).
- Merchant prefixes approximated: Kotlin builds 'UPI - <vpa>', 'IMPS Transfer - Mobile XXXnnn', 'ATM - <id>', 'Cash Deposit - ATM <id>'; the engine cannot prepend literals to extracted groups, so the manifest uses static labels (UPI Transaction, IMPS Transfer, ATM Transaction, Cash Deposit) plus a bare-VPA/ATM-id extractFieldWhen override. Channel priority preserved by running pipeline setFieldWhen steps in reverse Kotlin priority order.
- Plain 'Your A/C ... is debited/credited by INR' messages have no merchant (Kotlin also returns null merchant); engine reports confidence REVIEW with reasons [MISSING_MERCHANT] for those fixtures instead of Kotlin's silent null.
- creditLimit extraction omitted: Kotlin only extracts available limit when type == CREDIT (card bill credit), which never occurs for IDFC formats; 'Avbl Limit' in card SMSes is intentionally not captured, matching Kotlin output.
- Base BankParser fallbacks (CompiledPatterns generic amount/merchant/account/balance/reference patterns and the investment-keyword type check) were not ported wholesale; the IDFC-specific patterns cover all documented formats and all original test bodies. Kotlin's IDFC type keywords also take precedence over the base investment check, so omitting investment typeRules is the faithful choice.
- All 6 positive and 2 negative SMS bodies are verbatim from IDFCFirstBankParserTest.kt; validate-manifest prints OK 8/8 and oxlint reports no issues.

## indian-bank (`in.indianbank.bank`) — partial, 8/8 fixtures

- ATM merchant: Kotlin synthesizes 'ATM - <location>'; the engine cannot concatenate text, so the capture spans 'ATM at <location>' instead (fixture asserts 'ATM at MAIN STREET BRANCH' vs Kotlin's 'ATM - MAIN STREET BRANCH').
- Transaction type is classified entirely via pipeline setFieldWhen steps in reverse priority order (each later match overwrites) instead of typeRules, because the Kotlin parser checks its own debited/withdrawn/upi-payment/credited/deposited/received keywords BEFORE the base class's investment check, while engine typeRules would rank investment first.
- 'upi payment' && !received -> EXPENSE compound rule ported as a setFieldWhen with notContainsAny ['received'].
- Added 'payment' to filter.requireAnyKeyword: Kotlin admits 'UPI payment of Rs.' messages via the broad SmsFilter.isTransactionMessage fallback, which the engine has no equivalent for.
- Base-class compound skip rule ('pls pay' AND 'min of') not portable to filter.excludeKeywords (no AND support); partially covered by 'min amount due'/'minimum amount due'/'is overdue' excludes.
- Engine has no isValidMerchantName gating during extraction, so the first matching extractor wins even for low-quality captures; for the deposit/plain-credit formats the base TO_PATTERN fallback yields merchant 'a/c \*NNNN' — identical to what the Kotlin base class actually produces (the original tests simply did not assert merchant there).
- Base CompiledPatterns.Account GENERIC_ACCOUNT fallback intentionally omitted: the engine lacks Kotlin's isValidAccountLast4 date/year rejection and the pattern would frequently grab date fragments.
- Kotlin detectIsCard's extra masked-digit regex check ('ending' + XXXX1234) is not expressible in cardRules; ported as keyword include/exclude lists only.
- Mandate-notification helpers (isMandateNotification/parseMandateSubscription) are a separate Kotlin API consumed by the app's subscription layer, not part of parse(); not portable to the manifest format and not ported.
- All 6 SMS bodies from IndianBankParserTest.kt preserved verbatim as fixtures, plus a synthesized 'UPI payment of Rs.' expense fixture (format only exists as parser regexes/doc comments) and an OTP FILTER_REJECTED fixture.

## indus-ind-bank (`in.indusind.bank`) — partial, 11/11 fixtures

- Kotlin skips interest payouts only when BOTH 'net interest' AND 'deposit no' appear; engine excludeKeywords are single-substring, so 'net interest' alone is used (slightly broader rejection).
- Kotlin type order (spent/debited/purchase -> EXPENSE before deposit/fd/ach -> INVESTMENT before base classifier) cannot be expressed in typeRules (engine puts investment first), so it is reproduced with two pipeline setFieldWhen steps; base investment keywords ported as a subset (bare 'ach'/'nse'/'bse' substrings omitted from typeRules to avoid false hits — 'ach'/'fd'/'deposit' are handled by the pipeline step, mirroring Kotlin's substring checks).
- Engine has no isValidMerchantName re-check after extraction, so the base CompiledPatterns.Merchant fallbacks could in theory return tokens Kotlin would discard; all fixtures hit the IndusInd-specific patterns first.
- Debit-card-purchase fixture asserts merchant 'Debit' — this is what the Kotlin towards-pattern actually returns at runtime (the original test simply did not assert merchant).
- Balance 'Avl Bal:00.00' is asserted as string '00.00'; Kotlin's BigDecimal normalizes it to 0.00 (numerically equal, engine keeps raw digits).
- Kotlin's null accountLast4 for ACH/NACH ledger lines is reproduced structurally (no account extractor matches those bodies) rather than via an explicit ACH guard; the unmasked base fallback requires >=4 digits so the Kotlin '<3 digits -> null' reject path is approximated.
- isBalanceUpdateNotification/parseBalanceUpdate (balance-only BalanceUpdateInfo with as-on date) has no manifest equivalent; balance-only SMS are FILTER_REJECTED instead, matching the transaction-parse shouldParse=false expectation.
- All 11 fixture bodies and expected values come verbatim from IndusIndBankParserTest.kt (three duplicate JK/JX/JD sender variants collapsed to one; sender coverage retained via dispatch dltPatterns).

## ippb (`in.ippb.bank`) — partial, 6/6 fixtures

- Created /Users/vijayabaskar/work/unmiser/lib/parser/manifests/ippb.ts; validate-manifest prints 'OK in.ippb.bank: 6 fixtures pass' and oxlint is clean.
- No original Kotlin tests reference IPPBParser/IPBMSG anywhere under parser-core/src/test, so all 6 fixtures are synthesized from the parser's regexes and doc comments (debit-to-VPA, debit-for-UPI fallback, received-a-payment credit, Info: UPI/CREDIT credit, plus two FILTER_REJECTED cases).
- Kotlin's conditional merchant logic (only run 'to X' when body contains 'debit', 'from X thru' when 'received a payment') is ported as pipeline setFieldWhen/extractFieldWhen steps; the 'UPI Payment' fallback is set first and overridden by a successful 'to <payee>' extraction, matching Kotlin's priority.
- Approximation: BankParser's compound skip rule ('pls pay' AND 'min of') is not expressible in excludeKeywords (OR semantics); covered instead by 'min amount due'/'minimum amount due'/'is overdue'. Similarly the positive check ('info: upi' AND 'credit') is approximated by 'credit' in requireAnyKeyword (slightly broader acceptance).
- Approximation: BankParser's CompiledPatterns generic fallbacks (super.extractAmount/Merchant/Balance/Reference) are not fully ported — IPPB's own patterns (generic Rs amount, Avl Bal, Ref/Info:UPI, A/C Xnnnn) cover all known IPPB formats.
- Engine-semantics deviation: for the 'Info: UPI/CREDIT' credit format the Kotlin parser returns a transaction with null merchant; the RN engine flags MISSING_MERCHANT and yields confidence REVIEW (fields otherwise identical) — fixture asserts REVIEW with reasons ['MISSING_MERCHANT'].
- Kotlin's extractAccountLast4 returns numbers shorter than 4 digits as-is; the engine's takeLast4 has the same behavior, so this is faithful.
- Bundle not registered in manifests/index.ts per instructions.

## jio-payments-bank (`in.jiopayments.bank`) — partial, 6/6 fixtures

- No original Kotlin tests exist for JioPaymentsBankParser (grep of parser-core/src/test found nothing); all 6 fixtures were synthesized from the parser's regexes and doc-comment examples (UPI/CR/700003371002/AMAN KU, Rs. 1170.00 Sent from, Avl. Bal: Rs. 9095.5).
- Kotlin's constant merchant fallbacks 'UPI Credit' (upi/cr with no trailing /name) and 'UPI Payment' (upi/dr with no name) are not portable: setFieldWhen on a upi/cr substring would clobber names extracted from UPI/CR/<ref>/<name>, and the engine has no field-is-unset condition. Only the 'Money Transfer' fallback (sent from without a UPI segment) is ported via setFieldWhen with notContainsAny.
- Kotlin type priority (credited > upi/cr > debited > upi/dr > sent from, first match wins) is reproduced with setFieldWhen pipeline steps in reverse order since the last matching pipeline step wins; messages containing both 'credited' and 'debited' therefore classify INCOME, matching Kotlin but inverting the engine's default expense>income typeRules order.
- Kotlin's isTransactionMessage checks its Jio-specific positive keywords (jpb a/c, upi/cr, upi/dr, sent from) BEFORE the base skip list, so e.g. a 'JPB A/c ... offer' message would pass in Kotlin; the engine always runs excludeKeywords first, so such messages are FILTER_REJECTED here.
- Base BankParser fallbacks ported as lower-priority extractors: CompiledPatterns Amount (Rs/INR/rupee-symbol), Merchant (to/from/at/for), Balance, Reference (generic Ref/Txn + UPI), Account (A/c|Account|Acct + Card with takeLast4). Not ported: SmsFilter.isTransactionMessage final fallback, isValidAccountLast4 date/year rejection heuristics, the 'cashback && !earn cashback' income nuance (plain 'cashback' keyword used), and isValidMerchantName common-word gating during extraction.
- Real bank with account masks (JPB A/c x4288, from x4288), so accountLast4 is extracted for real; no '0000' wallet fallbackField added.
- Not registered in manifests/index.ts per instructions; validate output: OK in.jiopayments.bank: 6 fixtures pass; oxlint clean (exit 0).

## jk-bank (`in.jkbank.bank`) — partial, 9/9 fixtures

- No original Kotlin tests reference JKBankParser anywhere under parser-core/src/test/, so all 9 fixtures were synthesized from the parser's regexes and doc comments (RTGS debit, UPI credit, mTFR mPay, IMPS fund transfer, TIN tax, clearing-corporation investment, CHRGS, OTP reject, RTGS-confirmation reject).
- Kotlin returns merchant = null for 'by CHRGS/...' bank-charge debits; the manifest engine cannot unset a field (null merchant would also force REVIEW/MISSING_MERCHANT), so these are mapped to merchant 'Bank Charges' via a pipeline setFieldWhen.
- Kotlin skips RTGS/NEFT/IMPS confirmation SMS only when they ALSO contain 'has been credited'; filter.excludeKeywords cannot express AND, so the manifest excludes on 'your rtgs/neft/imps txn' alone — a debited-variant confirmation would be over-rejected (unobserved in practice).
- Kotlin's 'cashback && !earn cashback' income rule is approximated by income keyword 'cashback' plus excludeKeywords 'offer'/'cashback offer' (promotional 'earn cashback' messages are filter-rejected anyway).
- Kotlin's custom MD5 transaction hash (JKBANK|amount|REF/TIME/BAL composition via extractTransactionTime) is not portable; the engine's standard transactionHash(sender, amount, body) is used. extractJKBankReference in the Kotlin file is dead code (never invoked) and was not ported.
- Kotlin's unconditional default merchant 'UPI' (for via-UPI messages with no extractable counterparty) and 'ATM' (for any message containing ATM/withdrawn, evaluated mid-priority) have no conditional-fallback equivalent; the manifest's to-VPA / to-X-via-UPI extractors cover the observed UPI formats instead. ATM RECOVERY -> 'ATM Recovery Charge' IS ported.
- Base-parser fallback patterns for amount (Rs/INR/rupee-symbol order preserved), reference, accountLast4 (with takeLast4), and balance were appended after the JK-specific extractors in original priority order.

## jupiter-bank (`in.jupiter.bank`) — partial, 5/5 fixtures

- No original Kotlin tests exist for JupiterBankParser (only an incidental mention in CredParserTest.kt), so all 5 fixtures are synthesized from the parser's doc comments and regexes (Edge CSB RuPay credit card debit, UPI debit/credit, spend, OTP rejection).
- Kotlin canHandle accepts only DLT-shaped senders (^[A-Z]{2}-JTEDGE(-S|-T)?$), so dispatch has dltPatterns only and no exact senders list.
- Base isTransactionMessage's final fallback to SmsFilter.isTransactionMessage (broad pattern matching when no transaction keyword is present) is not portable; filter.requireAnyKeyword covers only the explicit keyword list.
- Base compound skip rule (contains 'pls pay' AND 'min of') cannot be expressed in filter.excludeKeywords and was dropped; the other due-reminder keywords ('is due', 'min amount due', etc.) are ported.
- Kotlin's 'cashback' income keyword has an '&& !contains("earn cashback")' guard the engine typeRules cannot express; 'cashback' is kept unguarded ('cashback offer' is still filter-excluded).
- Base isValidAccountLast4 date/year-rejection heuristics and the >=3-digit minimum are not portable; engine takeLast4 is used instead.
- Base isValidMerchantName validation (min length, common-word rejection, no '@') does not run on extract.merchant matches; in practice the Jupiter pipeline setFieldWhen steps ('Credit Card Payment'/'UPI Transaction') and the 'Jupiter Transaction' fallbackField dominate, matching Kotlin's keyword-switch behavior.
- Kotlin merchant when-clause priority (credit card before upi) is reproduced by ordering the 'upi' setFieldWhen before the 'credit card' one so the latter overwrites when both keywords appear.
- extractAvailableLimit was not ported: it only fires for TransactionType.CREDIT, which Jupiter's inherited extractTransactionType never produces.

## juspay (`in.amazonpay.wallet`) — partial, 11/11 fixtures

- Filter ordering deviation: Kotlin checks Juspay-specific transaction keywords BEFORE the base skip-list, so a Juspay message containing e.g. 'offer' or 'discount' would still parse; the engine runs excludeKeywords before requireAnyKeyword, so such messages are FILTER_REJECTED. Approximated by porting the full BankParser skip-list as excludeKeywords.
- Kotlin first-match-wins merchant keyword map and transactionType when-chain are ported as reverse-ordered setFieldWhen pipeline steps (engine is last-write-wins), preserving Kotlin priority; merchant keyword steps are guarded with notContainsAny ['successful at'] because the regex-extracted merchant outranks the keyword map in Kotlin.
- super.extractAmount (CompiledPatterns.Amount) fallback not ported — Juspay's own generic 'Rs <amt>' / 'INR <amt>' patterns make it unreachable in practice. super.extractReference (CompiledPatterns.Reference) fallback also not ported; the two Juspay 12-digit reference patterns cover all known formats. Balance is intentionally NOT extracted: 'Updated Balance is Rs X' does not match any base CompiledPatterns.Balance pattern in Kotlin either.
- Wallet provider with no account number in SMS: pipeline fallbackField accountLast4 '0000' added per jiopay.ts rationale (Kotlin returns null accountLast4).
- Fixture bodies taken verbatim from JuspayParserTest.kt (9 transaction formats incl. dlt-style senders XX-JUSPAY-X / JM-JUSPAY-A); the two REJECTED fixtures (OTP, cashback offer) are synthesized since the original tests have no negative message cases.

## karnataka-bank (`in.karnataka.bank`) — partial, 6/6 fixtures

- No original Kotlin tests exist for KarnatakaBankParser; all 6 fixtures are synthesized from the parser's doc comments and regexes (debit 'DEBITED for Rs.6368/-', credit 'a/c XX1234 is credited by Rs.6600.00', ACH, UPI, plus 2 FILTER_REJECTED cases).
- Kotlin's 'UPI Transaction' fallback (when contains('upi') and the from-pattern fails validity) is approximated via pipeline setFieldWhen merchant='UPI Transaction' then extractFieldWhen re-running the ACH/from extractors so a real payer name still wins; matches Kotlin for all realistic bodies but a UPI body where only a base-class merchant pattern (to/at/for) would have matched gets 'UPI Transaction' here too — which is actually what Kotlin does as well (it never reaches super for upi messages), so behavior is faithful.
- Kotlin merchant validity (rejects @ VPAs, all-digit names, common words) is approximated by excluding '@' in the from-pattern character classes; engine's isValidMerchantName is not run inline per-extractor.
- Kotlin's 'lic of india' special case returns title-cased 'LIC of India'; here a literal-capture extractor returns the message's own casing (e.g. 'LIC OF INDIA' from ACH narration), and ACH extraction takes priority exactly as in Kotlin.
- ACH narrations classify as INVESTMENT (typeRules investment includes 'ach'/'nach'/'ecs' etc.), faithfully reproducing BankParser.isInvestmentTransaction's broad contains() behavior including its known over-matching (e.g. 'nse', 'sip' substrings).
- BankParser.isTransactionMessage's final fallback to SmsFilter.isTransactionMessage broad patterns is not ported; filter.requireAnyKeyword carries only the 8 explicit transaction keywords (debited/credited/withdrawn/deposited/spent/received/transferred/paid).
- BankParser.isValidAccountLast4 date/year heuristics (rejecting last-4 captured from dates like 04/11/2025) are not expressible in the manifest format and are not ported.
- Kotlin's 'cashback' INCOME rule excludes 'earn cashback'; the engine typeRules cannot express the negation — promotional 'earn cashback' bodies are usually filter-rejected via 'offer'/'win ' anyway.
- Kotlin canHandle contains() checks widened to ._KEYWORD._ dltPatterns alongside the exact anchored DLT regexes and direct sender ids KBLBNK/KARBANK.
- Fixture 1 (documented debit format) has no merchant in the SMS, same as the Kotlin parser (null merchant); the engine surfaces this as confidence REVIEW with MISSING_MERCHANT, asserted as such.

## kasikorn-bank (`th.kasikorn.bank`) — partial, 7/7 fixtures

- KasikornBankParser.kt defines only canHandle; all extraction logic ported from BaseThailandBankParser.kt plus shared BankParser/CompiledPatterns account+reference fallbacks (super.extractAccountLast4 / extractReference).
- Fixture bodies for the 3 transaction formats are verbatim from ThailandBankParsersTest.kt (kasikorn section); expected amounts/balances/accountLast4/types match the Kotlin test expectations. 2 fixtures synthesized (credit-card spending with Available limit, Thai deposit) plus 2 FILTER_REJECTED fixtures (OTP, promotion).
- Deviation: formats with no merchant (Receive/PromptPay/Thai deposit) parse to confidence REVIEW with MISSING_MERCHANT in this engine, whereas the Kotlin parser returns a successful ParsedTransaction with merchant=null. All extracted field values remain identical; fixtures assert REVIEW.
- Faithful quirk preserved: the Thai-base merchant regex captures a trailing period (merchant "SHOPEE.") because Kotlin cleanMerchantName only trims; no stripPattern added.
- Approximation: base isInvestmentTransaction has a long mostly-India-specific keyword list; only a small generic subset (mutual fund, clearing corporation, sip purchase) was ported to typeRules.investment.
- Approximation: engine regexes default to case-insensitive; Kotlin amount/USD patterns are case-sensitive (THB/USD uppercase). Case-insensitive is a superset and changes no fixture outcome.
- Engine takeLast4 keeps digits when fewer than 4 are present; Kotlin extractLast4Digits returns null below 3 digits. No fixture exercises this edge.
- canHandle contains(KASIKORN)/contains(KASIKORNBANK) mapped to dispatch.dltPatterns ["^.*KASIKORN.*$"] with exact sender "KBANK" in dispatch.senders.

## kerala-gramin-bank (`in.keralagramin.bank`) — partial, 5/5 fixtures

- Kotlin pads accounts with fewer than 4 digits (digits.padStart(4,'0')): 'Account XXXX123' -> '0123'. The engine's takeLast4 normalization cannot pad, so the fixture asserts the closest faithful value '123' instead of '0123'.
- Kotlin returns 'UPI Payment' only when the VPA local part is all digits (or empty); the engine cannot test digit-ness conditionally, so this is implemented as an unconditional pipeline fallbackField merchant='UPI Payment'. Safe in practice because both documented KGB formats are UPI and the filter only admits debit/credit transaction messages, but an unknown future format without merchant info would get 'UPI Payment' instead of MISSING_MERCHANT/REVIEW.
- The debit-narrative merchant 'UPI Transfer' is a setFieldWhen on containsAll ['debited','credited to'], matching Kotlin's contains() checks exactly.
- canHandle's substring checks (KGBANK / KERALA GRAMIN / KERALAGR) became dltPatterns '^._KGBANK._$' etc. (engine matches case-insensitively), plus exact senders from the original tests (KGBANK, AD-KGBANK-S, BX-KGBANK-S).
- All 4 SMS bodies are verbatim from KeralaGraminBankParserTest.kt; the 5th fixture is a synthesized OTP message asserting FILTER_REJECTED (excludeKeywords otp/password).

## kotak-bank (`in.kotak.bank`) — partial, 7/7 fixtures

- All 5 original KotakBankParserTest.kt SMS bodies ported verbatim and pass with their expected values; 2 synthesized FILTER_REJECTED fixtures (OTP, UPI collect request) added.
- Kotlin's UPI-id heuristics (isPaymentAppGeneratedId + extractMerchantFromBankCode table, >20-char alphanumeric generated-id detection, phone-numbers-with-separators handling) cannot be expressed declaratively; approximated with pipeline setFieldWhen overrides for known QR prefixes (paytmqr->Paytm, phonepeqr/phonepe.qr->PhonePe, amazonpayqr->Amazon Pay, bharatpeqr->BharatPe, mobikwikqr->MobiKwik, freechargeqr->Freecharge). Unknown long generated ids fall through as the raw VPA local part instead of the bank-code app name.
- Kotlin's 'cashback' INCOME rule excludes 'earn cashback'; the engine typeRules cannot express a negative guard, so an 'earn cashback' message without other keywords would classify INCOME (most such promos are filter-rejected by 'offer' anyway).
- Kotlin extractLast4Digits returns null when fewer than 3 digits are captured; engine takeLast4 returns whatever digits exist. No Kotak format observed that hits this edge.
- Kotlin's isValidAccountLast4 date/year rejection and isValidMerchantName validation are not enforced by the engine at extraction time; extractor ordering (Kotak 'AC X1234' pattern first) makes this moot for all known formats.
- Standard debit fixture asserts merchant 'your Kotak Bank AC X4444' — this matches what the Kotlin base from-pattern fallback also produces (the original test simply does not assert merchant for that case).
- Dispatch is dltPatterns-only (^[A-Z]{2}-KOTAKB-[ST]$), faithful to Kotlin canHandle which accepts no plain sender ids; engine compiles it case-insensitively so lowercase DLT prefixes would also match (Kotlin uppercases first, so equivalent).

## krung-thai-bank (`th.ktb.bank`) — ported, 6/6 fixtures

- KrungThaiBankParser.kt only defines canHandle/getBankName; all extraction/classification behavior comes from BaseThailandBankParser + BankParser fallbacks, ported 1:1 (same structure as the existing bangkok-bank.ts exemplar).
- canHandle is exact 'KTB' plus contains KRUNGTHAI/KRUNG THAI -> senders ['KTB'] + dltPattern '^._KRUNG\\s?THAI._$'. Note: Kotlin requires exact equality for 'KTB' but substring contains for KRUNGTHAI; the dltPattern faithfully covers only the contains() variants.
- Kotlin returns merchant=null for plain Thai deposit/withdrawal formats; engine flags those fixtures REVIEW with MISSING_MERCHANT (engine semantics, not a parsing deviation).
- First three fixture bodies are verbatim from ThailandBankParsersTest.kt with matching expected values; card-payment and credit-card-spending fixtures are synthesized from the base parser's regexes.
- Kotlin isValidMerchantName post-validation (rejecting all-digit/@/common-word merchants) is approximated via cleaning.commonWords incl. Thai stop words; the engine cannot fall through to the next merchant pattern on validation failure.
- extractAvailableLimit is mapped to creditLimit, matching the Kotlin parse() field assignment.

## krungsri-bank (`th.krungsri.bank`) — ported, 6/6 fixtures

- KrungsriBankParser.kt is a thin subclass of BaseThailandBankParser.kt (only getBankName/canHandle); all extraction/type/filter behavior is ported from the Thai base class, matching the existing gsb-bank.ts/baac-bank.ts ports.
- canHandle exact match 'BAY' -> dispatch.senders; contains KRUNGSRI/AYUDHYA -> dltPatterns ^._KRUNGSRI._$ and ^._AYUDHYA._$.
- All 3 original test SMS bodies from ThailandBankParsersTest.kt preserved verbatim with their expected values; plus 2 synthesized fixtures (credit-card spending with available limit, Thai deposit with balance) and 1 FILTER_REJECTED OTP fixture.
- Kotlin's isValidMerchantName English common-word list (USING/VIA/.../THE) is not representable in cleaning.commonWords alongside the Thai words without diverging from the established Thai-base port convention; only the Thai connectives are listed, same approximation as gsb-bank.ts.
- Inherited BankParser reference/account fallback patterns (CompiledPatterns) are included ahead of the Thai-specific A/C|บช xNNNN pattern, mirroring the super.extractAccountLast4 call order.

## ktc-credit-card (`th.ktc.card`) — partial, 6/6 fixtures

- Kotlin type fallback `parsed.type ?: CREDIT` plus the BaseThailandBankParser first-match `when` (credit > expense > income) cannot be expressed in typeRules with a default, so it is implemented as reverse-priority-ordered pipeline setFieldWhen steps (default CREDIT written first, credit keywords written last); result is equivalent to Kotlin's first-match semantics.
- BankParser.isInvestmentTransaction (INVESTMENT priority) was NOT ported: its keyword list is entirely Indian clearing corps/brokers (ICCL, NSCCL, Groww, Zerodha, NACH...) and is unreachable for KTC THB card alerts; classifying it would also have required notContainsAny guards on every other pipeline step.
- Kotlin returns a parsed transaction with merchant = null for the Thai international-spending format ("ยอดใช้จ่ายต่างประเทศ 120.50 USD"); the engine instead yields confidence REVIEW with reason MISSING_MERCHANT — fixture asserts the actual engine behavior.
- Kotlin's isValidAccountLast4 (rejects dates/RRNs near the matched digits) and the GENERIC_ACCOUNT catch-all pattern are not portable; only AC_WITH_MASK, CARD_WITH_MASK and the Thai "A/C xNNNN" pattern were ported with takeLast4.
- isFromCard = true is force-set via an unconditional (empty-condition) setFieldWhen pipeline step, matching KTCCreditCardParser always returning isFromCard = true.
- creditLimit holds the extracted _available_ limit, same as the Kotlin parser's creditLimit field (Kotlin TODO notes it is actually available limit).
- dispatch covers canHandle exactly: sender == "KTC" (exact id) and contains "KRUNGTHAI CARD" (dltPattern "^._KRUNGTHAI CARD._$", engine matches case-insensitively).

## laxmi-bank (`np.laxmi.bank`) — partial, 5/5 fixtures

- Merchant for the salary fixture is "SALARY CREDIT" instead of the Kotlin test's "SALARY CREDIT\n-Laxmi Sunrise": the Kotlin Remarks regex ([^)]+) swallowed the "-Laxmi Sunrise" signature line; the manifest regex stops at "/", ")" or newline, which is a cleaner intentional deviation.
- Filter order inversion: Kotlin's Laxmi isTransactionMessage checks positive keywords BEFORE the base-class skip list (so an OTP message containing "dear customer" would pass in Kotlin), while the engine runs excludeKeywords before requireAnyKeyword. The base-class skip keywords (otp, payment request, etc.) were ported as excludeKeywords, so OTP/promo messages are rejected even when they contain Laxmi positive keywords — safer but not byte-identical.
- Kotlin's generic fallback (any message containing "ESEWA" anywhere -> merchant "ESEWA" when no Remarks match) is approximated by a setFieldWhen pipeline step keyed on "esewa load" only, to avoid clobbering remarks-derived merchants that merely mention eSewa.
- Base BankParser fallback extractors (CompiledPatterns amount patterns, generic merchant/reference/account/balance fallbacks) were not ported wholesale; only the Laxmi-specific patterns plus the base-class transaction keywords (in requireAnyKeyword) and skip list (in excludeKeywords) are included, since all known Laxmi formats match the bank-specific patterns.
- Kotlin canHandle's contains("LAXMI") is expressed as an unanchored dltPattern "LAXMI"; the anchored ^[A-Z]{2}-LAXMI-[A-Z]$ DLT pattern is also kept (test sender AD-LAXMI-A is exercised by a fixture).
- Reference field follows the Kotlin quirk of using the DD/MM/YY date after "on" as the transaction reference, falling back to a 6+ digit number in the remarks.

## lazy-pay (`in.lazypay.wallet`) — partial, 5/5 fixtures

- No original LazyPay tests exist in the Cashiro repo; all 5 fixtures synthesized from LazyPayParser.kt regexes and doc comments (BP/JM/JD-LZYPAY-S senders).
- Kotlin's conditional promo skip (reject 'offer'/'get cashback'/'explore more' unless body has 'payment of' or 'was successful') is reproduced via requireAnyKeyword alone; edge-case deviation: a promo containing 'against your lazypay statement' or 'thanks for your payment' but neither allow-back phrase would be rejected by Kotlin yet accepted here.
- Special-case merchant mapping (Zepto Marketplace->Zepto, Innovative Retail Concepts->BigBasket, Swiggy, Zomato) ported as setFieldWhen steps that test the whole body rather than only the regex-extracted merchant segment.
- super.extractAmount/extractReference/extractMerchant fallbacks not ported: the LazyPay 'Rs <amt>' and 'txn <id>' patterns cover all known formats; default merchant is fallbackField 'LazyPay' (Kotlin: super.extractMerchant ?: 'LazyPay').
- BNPL wallet with no account number in SMS: pipeline fallbackField accountLast4 '0000' per jiopay.ts rationale; transactionType always CREDIT via fallbackField, matching extractTransactionType.
- Base-class available-limit extraction (runs for CREDIT type) ported as extract.creditLimit with the two most common Rs patterns; remaining base variants omitted as LazyPay SMS never carry limits.

## liv-bank (`ae.liv.bank`) — partial, 6/6 fixtures

- No original Kotlin tests reference LivBankParser; all 6 fixtures are synthesized from the parser's regexes and doc comments (incl. one FILTER_REJECTED OTP fixture).
- Kotlin extractCurrency can return a per-message currency (e.g. USD for foreign card purchases); the engine always reports the manifest currency AED. The foreign-currency fixture asserts amount/type but not currency.
- Kotlin's month-abbreviation skip in UAE amount/currency extraction is ported as a (?!JAN|FEB|...) negative lookahead inside the amount regexes; a \b was added to the bare '[A-Z]{3} amount' pattern to avoid mid-word matches the Kotlin scan-with-priority avoided differently.
- Kotlin income keywords (has been credited / credited to account / refund / cashback) are checked before expense keywords; ported as a pipeline setFieldWhen step since engine typeRules rank expense above income.
- LivBankParser.detectIsCard short-circuits on Liv card keywords before the base account-exclusion list, so cardRules.excludeKeywords is set to [] — a generic account message containing 'debit card' would be classified isFromCard=true (matches Liv override, deviates from BankParser base path).
- Base BankParser fallbacks ported only partially: SmsFilter broad-pattern fallback in isTransactionMessage, CompiledPatterns.Merchant generic merchant fallback, isValidAccountLast4 date/year rejection, and credit-limit extraction (Rs-based, India-specific) are not portable to the declarative format; non-purchase non-credit messages therefore have no merchant and fall to REVIEW (asserted in the ATM-withdrawal fixture).
- Kotlin extractLast4Digits returns null for <3 digits; engine takeLast4 returns whatever digits remain (edge case, not exercised by fixtures).
- dispatch dltPattern 'LIV' is unanchored to replicate the Kotlin contains("LIV") check, so unrelated senders containing LIV (e.g. DELIVERY) would match — same over-matching as the original.

## m-bank-cz (`cz.mbank.bank`) — partial, 5/5 fixtures

- Czech decimal-comma amounts cannot be reproduced: the engine normalizes amounts by stripping commas (Indian thousands convention), so "100,00 CZK" would become "10000". The extractor captures only the integer-koruna part; fixtures assert "100"/"500"/"250" instead of Kotlin's 100.00/500.00/250.00 (haler decimals dropped — exact for the ",00" cases in all original tests, truncating for nonzero decimals).
- Space-grouped thousands ("1 500,00 CZK") are not handled: the integer-capture regex would match only "500". The Kotlin [\d\s]\* capture cannot be ported because the engine never strips internal spaces from amounts. No original test exercises this format.
- Kotlin checks 'prichozi' (income) before expense keywords; the engine's fixed typeRules priority evaluates expense first. No mBank CZ message mixes the keyword sets, so outcomes are identical.
- Kotlin runs isValidMerchantName on merchant patterns 1-2 before accepting; the engine has no per-extractor validity gate. Practical effect is nil for the observed formats.
- No reference/balance/accountLast4 extractors ported: MBankCZParser inherits the BankParser base patterns, which are Indian-format (Rs., A/c, UPI Ref) and never match Czech bodies — the Kotlin base would also return null. mBank CZ SMS carry no own-account digits, and no wallet-style 0000 fallback was added (bank, not wallet).
- canHandle's contains(MBANK)+contains(CZ) check is covered by dltPattern "^(?=.*MBANK)(?=.*CZ).\*$" (case-insensitive in the engine) plus exact senders MBANK / mBank CZ.
- Two synthesized fixtures beyond the 3 original Kotlin tests: an ATM-withdrawal (vyber) body expecting REVIEW/MISSING_MERCHANT (withdrawals have no merchant), and a confirmation-code (kod) body expecting REJECTED/FILTER_REJECTED.
- Engine default English cardRules excludes were cleared (excludeKeywords: []) so detectIsCard matches Kotlin's plain contains("platba kartou").

## m-pesa-tanzania (`tz.mpesa.wallet`) — partial, 5/5 fixtures

- Kotlin gates conjunctively on body containing 'tzs' AND 'confirmed' AND a transaction keyword; the declarative filter only expresses one OR-list, so the keyword list lives in filter.requireAnyKeyword and the tzs/confirmed checks are pipeline rejectWhen steps that yield REVIEW (+FILTER_REJECTED reason) instead of Kotlin's hard null/REJECTED — e.g. a Kenya Ksh M-PESA message containing 'paid to' parses to REVIEW rather than being dropped.
- Kotlin extractTransactionType checks INCOME phrases ('you have received'/'received tsh'/'received tzs') before EXPENSE; the engine's typeRules priority is expense-before-income, so INCOME is set via a pipeline setFieldWhen (runs before typeRules), preserving original priority.
- accountLast4: M-Pesa SMS normally carry no account, so pipeline fallbackField '0000' is used per the jiopay.ts wallet rationale (Kotlin returns null). The base BankParser AC_WITH_MASK pattern is ported so utility payments like 'paid to LUKU for account 1423XXXXXXX' extract '1423' (matches Kotlin base-class behavior); CARD_WITH_MASK/GENERIC_ACCOUNT base patterns and the date/year isValidAccountLast4 checks were not ported (no M-Pesa format triggers them).
- Engine takes the first merchant regex match without Kotlin's isValidMerchantName fall-through validation; no fixture is affected.
- Fixtures: 4 SMS bodies verbatim from TanzaniaParserTest.kt (received, sent P2P, Lipa merchant, LUKU utility) plus 1 synthesized OTP/PIN message asserting REJECTED/FILTER_REJECTED. The original tests did not assert accountLast4; the LUKU fixture asserts '1423' per base-class behavior.
- File pre-existed from a prior attempt; corrected its LUKU expected accountLast4 from '0000' to '1423' and added the AC_WITH_MASK extractor for fidelity. validate-manifest prints OK (5/5) and oxlint exits 0.

## manjushree-finance (`np.manjushree.bank`) — partial, 4/4 fixtures

- accountLast4 deviation (improvement): the Kotlin base AC_WITH_MASK mask class lacks '#', so for the real format 'A/C ##0168658000001' the original parser returned accountLast4=null (GENERIC_ACCOUNT only grabbed the stray '00' from '15,000.00', which failed the >=3-digit validity check). The manifest widens the mask class to [Xx*#] and drops the junk-prone GENERIC_ACCOUNT, so fixtures assert the real last-4 '0001' per the bank-parser real-last-4 rule.
- Kotlin parse() returns null when extractTransactionType is null (e.g. 'withdrawn' passes the keyword filter but the override types neither expense nor income); the engine instead yields REVIEW with MISSING_TYPE. Not exercised by fixtures.
- Base isTransactionMessage ends with a broad SmsFilter.isTransactionMessage OR-fallback that is not expressible in the manifest; approximated with filter.requireAnyKeyword over the base transaction-keyword list (covers all known Manjushree formats).
- Kotlin returns valid transactions with merchant=null (no counterparty); the engine downgrades these to REVIEW with MISSING_MERCHANT — the synthesized deposit fixture asserts that behavior.
- Only one real SMS body exists in ManjushreeFinanceParserTest.kt (the IBFT debit, ported verbatim); the credit and deposit fixtures are synthesized from the same template. The deposit fixture uses comma-terminated remarks because the Remarks regex ([^,]+) captures across newlines in both Kotlin and the engine.
- cleaning.stripPatterns run with gi flags in the engine, so the Kotlin case-sensitive DATE_SUFFIX/TIME_SUFFIX/TRAILING_PARENTHESES strippers become case-insensitive; no practical effect on these formats.
- File already existed from a prior workflow run with near-identical content; fixed the one failing fixture (reference captured across newline) and verified: validate-manifest prints OK (4 fixtures), oxlint clean.

## mashreq-bank (`ae.mashreq.bank`) — partial, 10/10 fixtures

- Per-message currency extraction (Kotlin extractCurrency reported USD/EUR for foreign card purchases) is not expressible — the engine reports the fixed manifest currency AED; USD/EUR original test cases assert currency AED with a comment.
- X-masked balances ('AED X,480.15'): Kotlin replaced X with 0 yielding '0480.15'; the manifest regex skips the masked prefix yielding '480.15' — numerically identical, string representation differs.
- Kotlin's type rules 'debit card + for-CCY-amount regex' / 'credit card + for-CCY-amount regex' approximated with containsAll ['debit card','for '] / ['credit card','for '] pipeline setFieldWhen steps (conditions cannot run regexes); a 'payment credited to your credit card' message would classify CREDIT instead of INCOME.
- extractTransactionType ported as setFieldWhen steps in reverse Kotlin priority since later pipeline steps override earlier ones; base-class fallback keywords live in typeRules.
- Merchant 'ATM Withdrawal'/'Transfer' overrides gated with notContainsAny ['debit card','credit card'] (and 'atm' for Transfer) to mimic Kotlin precedence; an atm+withdrawn+transfer message without card keywords resolves to 'ATM Withdrawal' as in Kotlin, but atm+transfer without 'withdrawn' would miss the 'Transfer' label (corner case).
- Base BankParser generic CompiledPatterns fallbacks (amount/merchant/reference/account/balance ALL_PATTERNS, Rs.-based extractAvailableLimit/creditLimit, SmsFilter broad fallback) not ported — all Mashreq SMS formats in the original tests are covered by Mashreq-specific patterns; requireAnyKeyword approximates the base transaction-keyword gate.
- All 6 positive and 4 should-not-parse SMS bodies from MashreqBankParserTest.kt preserved verbatim; fully masked 'Card ending XXXX' correctly yields no accountLast4 (asserted undefined), matching Kotlin's null.
- dispatch: contains('MASHREQ') ported as dltPattern '^._MASHREQ._$' (covers 'AE-MASHREQ-B' handle case), plus exact senders MASHREQ/MSHREQ and '^[A-Z]{2}-MSHREQ-[A-Z]$'.

## melli-bank (`ir.melli.bank`) — partial, 6/6 fixtures

- Kotlin's >=1000 IRR amount floor is not expressible declaratively; approximated by requiring comma-grouped thousands or a plain 4+ digit run in the amount regex. Edge case: a body with a sub-1000 amount before مبلغ plus a later >=1000 number could extract the later number where Kotlin returns null.
- Kotlin extractMerchant returns 'Card <16-digit-number>'; the engine cannot prefix literal text, so the manifest extracts the bare card number as merchant (asserted in the synthesized card-number fixture).
- Kotlin income rule `contains("credited") && !contains("block")` — the negative 'block' guard is not expressible in typeRules and was dropped; plain 'credited' maps to INCOME.
- Kotlin rejects payment-request messages containing BOTH درخواست and پرداخت; AND-exclusion is not expressible in filter.excludeKeywords, so a pipeline rejectWhen demotes them to REVIEW with FILTER_REJECTED instead of hard REJECTED.
- Kotlin requireAnyKeyword check compares lowercased message against uppercase 'IRR'/'TOMAN' (dead code in Kotlin); the engine lowercases both sides, so 'irr'/'toman' now actually match — strictly broader than the original.
- Base BankParser's isValidAccountLast4 validation (rejecting dates/RRNs near the account match) is not portable; raw CompiledPatterns.Account regexes plus the Iranian \d{4}[-\s]?(\d{4}) fallback are used as-is. That fallback captures the second 4-digit block of the first 8-digit run (faithful to Kotlin), not the card's last 4.
- The 4 original MelliBankParserTest.kt bodies are preserved verbatim; Kotlin yields merchant=null for them, so fixtures expect REVIEW with MISSING_MERCHANT (the engine flags missing merchant; field values match the Kotlin expected amounts/balances/types, isFromCard=true on the کارت purchase).

## mpesa (`ke.mpesa.wallet`) — partial, 8/8 fixtures

- Filter approximation: Kotlin isTransactionMessage requires 'confirmed' AND one of [paid to, sent to, received, new m-pesa balance]; the manifest filter cannot express an AND of two keyword groups, so requireAnyKeyword=['confirmed'] only. Messages with 'confirmed' but no transaction keywords pass the filter but fail amount/type extraction (REVIEW instead of REJECTED).
- Kotlin checks income keywords before expense; engine typeRules priority is expense>income, so INCOME is set via a pipeline setFieldWhen step (containsAny ['you have received','received ksh']) to preserve the original check order.
- Original Kotlin tests invoked parse() with non-MPESA senders ('Person 3', 'Bank OF Baroda Kenya Limited', 'Loop b2c') bypassing canHandle (whose own test cases mark 'Person 3' as false). The engine enforces dispatch, so all fixtures use sender 'MPESA'. dltPatterns ['M-?PESA'] covers the contains() checks.
- accountLast4: M-PESA wallet messages have no user account number, so pipeline fallbackField '0000' is used (jiopay.ts wallet rationale). Exception: the paybill fixture asserts '3123' because the Kotlin base BankParser's CompiledPatterns.Account would extract last-4 of the payee paybill account ('for account 123123') — faithful to the original, though it is the payee's account, not the user's.
- Merchant cleanup ports: cleaning.stripPatterns apply Kotlin's receivedFrom-only strips (trailing period, trailing phone, trailing 6+ digits) plus MPESAParser.cleanMerchantName globally to all merchant extractors; harmless for the other patterns since their captures never end in those suffixes. LIMITED/LTD deliberately NOT stripped per the MPESA override.
- Fixtures: 7 SMS bodies taken verbatim from MPESAParserTest.kt with the original expected values; 1 synthesized promotional message (no 'Confirmed') asserting FILTER_REJECTED.

## nabil-bank (`np.nabil.bank`) — partial, 5/5 fixtures

- Nabil SMS formats carry no merchant narrative; the Kotlin parser leaves merchant null, so transaction fixtures assert confidence REVIEW with MISSING_MERCHANT (engine has no concept of a merchant-less HIGH result).
- Kotlin's extractTransactionType is exhaustive (withdrawn->EXPENSE, deposited/credited->INCOME, else null with no super fallback); 'debited' bodies therefore yield MISSING_TYPE/REVIEW in the manifest where Kotlin parse() returned null — fixture 2 (verbatim original test body) asserts this mapping.
- BankParser.isValidAccountLast4 (date/RRN/year rejection with context checks) is not expressible in the declarative engine; Nabil's fallbackPattern lookarounds [(?<![A-Za-z0-9/₹$€£])...] cover the date cases in all fixtures, but a bare year like 'on 2026-04-17' with no account digits earlier in the body could be misextracted as accountLast4.
- Kotlin iterates fallbackPattern.findAll() with validity checks per match; the engine takes only the first regex match — equivalent for all known Nabil formats since the masked account precedes other digit runs.
- The base isTransactionMessage SmsFilter.isTransactionMessage broad fallback is not portable; filter uses the base keyword list (debited/credited/withdrawn/deposited/spent/received/transferred/paid) as requireAnyKeyword.
- Kotlin's NBSP normalization (  -> space) before account extraction is not portable; patterns use \s which already matches NBSP in JS regex.
- Base-class merchant validation (isValidMerchantName: common-word/UPI-ID rejection) runs per-candidate in Kotlin but not in the engine extract chain; ported merchant patterns are the base CompiledPatterns.Merchant verbatim.
- Only one real SMS body exists in the original tests (withdrawn example, preserved verbatim incl. the multiline Download App tail); deposited/credited fixtures are synthesized from the parser regexes.
- Regex lookbehind in the account fallback pattern requires a JS engine with lookbehind support (Bun/JSC passes; fine for Hermes >= 0.74/static Hermes — verify on target RN runtime).

## navy-federal (`us.navyfederal.bank`) — ported, 6/6 fixtures

- Filter ordering deviation: Kotlin checks NFCU keywords (transaction for / was approved on) BEFORE the base skip-list, so an approved NFCU alert containing a skip word like 'offer' would still parse in Kotlin; the engine runs excludeKeywords first, so such a message would be FILTER_REJECTED. No real NFCU alert format hits this.
- Kotlin returns null (silently skipped) for 'was declined' messages; manifest models this as filter.excludeKeywords -> FILTER_REJECTED, asserted by a fixture.
- Base BankParser CompiledPatterns fallbacks for amount/merchant/balance/reference/accountLast4 are INR/Rs-centric and were not ported; a generic '$<amount>' fallback extractor was added instead. balance/reference/creditLimit extraction omitted because NFCU alerts never carry them.
- cardRules.excludeKeywords set to [] because the Kotlin NFCU detectIsCard override matches 'debit card'/'credit card' BEFORE the base account-word exclusions.
- Kotlin's final SmsFilter.isTransactionMessage broad fallback is not portable; requireAnyKeyword covers the NFCU keywords plus the base transaction keyword list.
- All 6 fixtures use SMS bodies verbatim from NavyFederalParserTest.kt except the synthesized declined-rejection fixture (no original declined test body exists).

## nmb-bank (`np.nmb.bank`) — partial, 5/5 fixtures

- accountLast4 for the hash format 'A/C 0#16': Kotlin combines parts and pads to 4 digits ('0016'); the engine's takeLast4 strips non-digits without padding, yielding '016'. Fixture asserts the achievable '016'.
- Kotlin returns 'ATM - <location>' when an 'at <location>' clause is present in withdrawal SMS; the engine cannot prepend a literal prefix to an extracted group, so the generic 'ATM Withdrawal' label is always used (matches the only real test message).
- Kotlin's isTransactionMessage allows OTP/password messages through when they also contain 'withdrawn'; the flat excludeKeywords list cannot express that exception, so an OTP+withdrawn message would be rejected. No such message exists in the original tests.
- Kotlin's 'transfer && to a/c' => EXPENSE compound rule ported as a pipeline setFieldWhen containsAll step (typeRules cannot express AND).
- 3 fixtures are the original NMBBankParserTest.kt SMS bodies verbatim; the 'deposited' income fixture and OTP rejected fixture are synthesized from the parser's regexes (Kotlin has no deposit test; its extractMerchant also returns null for plain deposits, hence expected REVIEW + MISSING_MERCHANT).

## old-hickory (`us.oldhickory.bank`) — partial, 7/7 fixtures

- Kotlin prefixes merchant with 'Account: ' (e.g. 'Account: SAVINGS ACCOUNT'); the engine only extracts capture groups, so merchant is the bare account name.
- Kotlin renders reference as 'Alert threshold: $X.XX'; manifest reference is the bare threshold amount (commas preserved, e.g. '1,000.00').
- Kotlin returns non-numeric account identifiers from '(part of ACCOUNT#)' verbatim; the engine normalizes accountLast4 to digits, so digit-less identifiers yield no accountLast4 (fixture omits the field).
- Kotlin checks Hickory keywords before the base-class OTP/promo skip list, so no excludeKeywords were added; an OTP message containing 'transaction' passes in both implementations.
- Base-class SmsFilter.isTransactionMessage broad fallback and CompiledPatterns INR amount/account/balance fallbacks were not ported (not reachable/relevant for USD alert format); the base GENERIC_REF reference fallback was ported.
- Kotlin canHandle strips all non-digits before comparing to 8775907589; approximated with dltPattern '^\(?877\)?[\s.-]*590[\s.-]*7589$' covering common phone formattings.

## one-card (`in.onecard.card`) — partial, 5/5 fixtures

- No original Kotlin tests exist for OneCardParser (grep for OneCard/ONECRD under src/test found nothing); all 5 fixtures synthesized from the parser's doc comments and regexes.
- Deliberate fix vs source: added \b to the 'on MERCHANT on card' merchant pattern. The Kotlin regex (no word boundary) leftmost-matches the 'on' inside 'transaction' and would capture 'of Rs. X on MERCHANT' for the documented general format; the manifest extracts the intended merchant name.
- Kotlin super.parse() returns null when extractTransactionType finds no base keyword, so the documented 'fueled up'/'made a booking'/'made a transaction' formats actually fail to parse upstream (likely a source bug, since OneCardParser.parse force-copies type=CREDIT). The manifest follows the evident intent: pipeline fallbackField types every passing OneCard message as CREDIT.
- Engine runs excludeKeywords before requireAnyKeyword, whereas Kotlin checks OneCard's positive indicators before falling back to the base skip-list; also added base-class OTP/promotional excludes (otp, verification code, discount, 'win '). A hypothetical transactional SMS containing those words would be rejected here but accepted by Kotlin.
- Kotlin's per-pattern isValidMerchantName try-next-pattern loop is not reproducible in the engine (first regex match wins); fixture merchants are unaffected.
- Kotlin extracts availableLimit only when type==CREDIT; the manifest extracts creditLimit unconditionally — equivalent here since every OneCard transaction is CREDIT.
- canHandle's contains("ONECRD")/contains("ONECARD") checks subsume all its explicit DLT regexes, ported as dltPatterns ^._ONECRD._$ and ^._ONECARD._$ (case-insensitive in engine).

## parsian-bank (`ir.parsian.bank`) — partial, 5/5 fixtures

- ParsianBankParser.kt only overrides canHandle/getBankName; all behavior comes from BaseIranianBankParser, so the manifest mirrors the existing melli-bank.ts port of that base.
- Kotlin merchant is 'Card <full-number>'; the engine cannot prefix literals, so fixtures assert the bare card number '1234-5678-9012-3456'.
- Kotlin >= 1000 IRR amount floor approximated by requiring comma-grouped thousands or a 4+ digit run in the amount regex.
- Kotlin income guard `credited && !contains("block")` — the negative half is not expressible in typeRules and was dropped.
- Kotlin hard-rejects messages containing both درخواست and پرداخت; AND-exclusion is not expressible in filter.excludeKeywords, so a pipeline rejectWhen demotes them to REVIEW with FILTER_REJECTED instead of confidence REJECTED.
- Iranian accountLast4 fallback \d{4}[-\s]?(\d{4}) captures the second block of the card number (5678), matching Kotlin behavior, not the card's true last 4.
- All 4 SMS bodies from ParsianBankParserTest.kt ported verbatim with original expected values; tests assert merchant=null for non-card bodies, which maps to REVIEW/MISSING_MERCHANT in the engine; one synthesized OTP fixture covers FILTER_REJECTED.

## pnb-bank (`in.pnb.bank`) — partial, 7/7 fixtures

- 'thru card XX9239' merchant: Kotlin synthesizes 'Card XX9239'; the engine can only capture literal SMS text, so merchant is 'card XX9239' (lowercase, as in the SMS). Fixture asserts the achievable value.
- Plain 'Ac XX1234 Debited' alerts have no merchant; Kotlin returns merchant=null with a valid parse, but the engine flags MISSING_MERCHANT, so those two fixtures assert confidence REVIEW instead of HIGH.
- Kotlin's keyword merchant fallbacks (PNB ATM Withdrawal / NEFT Transfer / UPI Transaction) are ported as pipeline setFieldWhen steps in reverse priority order with notContainsAny guards ('thru card', 'auto pay', 'upi-mandate') so they don't clobber regex-extracted merchants; a message matching the generic 'From NAME/' merchant pattern that also contains UPI/NEFT keywords would be overwritten (Kotlin would keep the From-merchant).
- Kotlin's PNB unicode NFKD normalization for RCS messages (strip non-ASCII) has no engine equivalent and was not ported.
- Kotlin's single credit-amount alternation regex was split into two ordered extractors; if both forms appear in one message the first extractor wins regardless of position (Kotlin picks the leftmost match).
- Investment keyword list trimmed from BankParser.isInvestmentTransaction: bare high-false-positive substrings ('ach', 'ecs', 'nse', 'bse', 'cdsl', 'nsdl', 'kite', 'ipo', several broker names) omitted; Kotlin's naive contains() on these can misfire (e.g. 'reached' contains 'ach').
- Kotlin's 'cashback' income rule excludes 'earn cashback'; the manifest keyword list cannot express that exception.
- Base CompiledPatterns.Merchant to/from/at/for fallbacks were not ported: the engine has no isValidMerchantName gate during extraction, so they would capture junk like 'Rs' that Kotlin discards.
- Kotlin extractLast4Digits returns null when fewer than 3 digits; engine takeLast4 returns whatever digits exist (no PNB format hits this).
- isValidAccountLast4 date/year rejection heuristics from BankParser are not portable to the declarative format; account extractors anchor on Ac/A/c/Card prefixes instead.
- 'register for e-statement' positive filter keyword ported, but such messages usually lack an amount and would land in REVIEW rather than parse fully (same effective outcome as Kotlin returning null at extractAmount).

## prime-commercial-bank (`np.primecommercial.bank`) — partial, 4/4 fixtures

- Kotlin isTransactionMessage requires 'npr' AND ('withdrawn'|'deposited'); the engine's requireAnyKeyword is OR-only, so the manifest requires only the movement keywords. A movement message lacking 'NPR' would surface as REVIEW (MISSING_AMOUNT) instead of REJECTED.
- No balance extractor: the parser does not override extractBalance and the base-class CompiledPatterns.Balance patterns do not match this bank's 'Good Baln: NPR ...' wording, so the Kotlin parser also yields null balance — fixtures therefore assert no balance field.
- Kotlin canHandle normalizes '-' to '\_' before the PRIME*ALERT equality check; dispatch covers this via the '^.\_PRIME.*$' dltPattern (verified with the AD-PRIME-ALERT fixture from the original handleCases).
- Both real SMS bodies from PrimeCommercialBankParserTest.kt are preserved verbatim with their expected values; the third deposited fixture and the OTP rejection fixture are synthesized from the parser's regexes.

## priorbank (`by.priorbank.bank`) — ported, 4/4 fixtures

- All 3 SMS bodies from PriorbankParserTest.kt preserved verbatim with the original expected values; added 1 FILTER_REJECTED OTP fixture.
- Kotlin strips the 'BLR ' country prefix after matching the location merchant pattern; ported as an optional non-capturing (?:BLR\s+)? prefix inside the regex — behaviorally equivalent on all known formats.
- Kotlin re-validates each merchant candidate with isValidMerchantName and falls through to the next pattern on failure; the declarative engine takes the first regex match unconditionally. No known Priorbank format triggers the difference.
- canHandle's substring check sender.contains('PRIORBANK') is covered by dltPattern '^._PRIORBANK._$' in addition to exact senders.

## saraswat-bank (`in.saraswat.bank`) — ported, 11/11 fixtures

- Kotlin's 'for X' merchant alias table (S.I/SI -> Standing Instruction, NEFT/RTGS/IMPS -> '... Transfer') is ported as pipeline setFieldWhen steps keyed on body substrings ('for S.I.', 'for NEFT', ...) rather than on the extracted capture; behavior is equivalent for all known formats but a body containing e.g. 'for NEFT' in an unrelated clause would also trigger the alias.
- Kotlin's ATM fallback (merchant = 'ATM Withdrawal' only when towards/for patterns fail) is approximated with setFieldWhen when containsAny ['ATM','withdrawn'] + notContainsAny ['towards']; since setFieldWhen overrides extracted values, a debit with both 'for X' and 'ATM' in the body would resolve to the alias steps (ordered after ATM), matching Kotlin's effective priority in practice.
- Engine typeRules priority is expense>income (fixed), while Kotlin checks credited-first; keywords were kept specific ('is credited'/'credited with' vs 'is debited'/'debited with'/'withdrawn') so no fixture is affected.
- Base BankParser fallback extractors (generic amount/merchant/balance/reference patterns) were not ported beyond the filter keyword lists, since Saraswat's own patterns cover every documented format; only Saraswat's Pattern 1/2/3 regexes are included.
- 8 fixture bodies come verbatim from SaraswatBankParserTest.kt plus the distinct 'for SI.' factory-test body; the ATM withdrawal fixture is synthesized from the parser's Pattern 3 doc/logic (no original test exists for it); one OTP REJECTED fixture exercises the filter.
- No reference extractor: Saraswat SMS formats carry no transaction reference and the Kotlin parser never extracts one.

## selcom-pesa (`tz.selcom.wallet`) — partial, 7/7 fixtures

- Kotlin isTransactionMessage requires BOTH (confirmed|accepted) AND an action keyword; the engine filter only supports a single OR list, so the action keywords went to filter.requireAnyKeyword and the confirmed/accepted requirement is a pipeline rejectWhen with reason FILTER_REJECTED — such messages get confidence REVIEW instead of a hard REJECTED (fixture 'action keyword without confirmed/accepted marker' asserts this).
- accountLast4 falls back to '0000' for non-card wallet transactions (jiopay.ts wallet rationale); the Kotlin parser returned null. Card transactions extract the real last-4 from 'card ending [with] NNNN'.
- ATM merchant: Kotlin captures the location and rebuilds 'ATM - <location>' bypassing cleanMerchantName; the engine cannot prefix values, so the manifest captures the literal 'ATM - LOCATION' span. A dash-less 'at ATM LOCATION' would yield 'ATM LOCATION' (no normalized dash), and the Kotlin 'ATM Withdrawal' generic fallback (withdrawn+ATM with no extractable location) is not ported — such a message would land in REVIEW with MISSING_MERCHANT.
- Kotlin cleanMerchantName strip '\\s+-\\s+.\*$' was omitted because the engine applies cleaning.stripPatterns to ALL merchants including the ATM one (it would truncate 'ATM - TEMEKE BRANCH' to 'ATM'); the merchant capture groups already stop before any ' - ' suffix, so behavior is equivalent on all known formats.
- Base BankParser CompiledPatterns.Account.ALL_PATTERNS fallback (called via super.extractAccountLast4) was not ported — none of those generic account patterns apply to Selcom Pesa message formats, which only ever carry card last-4.
- All five SMS bodies from TanzaniaParserTest.kt preserved verbatim with their expected values; the two rejection fixtures are synthesized.

## siam-commercial-bank (`th.scb.bank`) — ported, 7/7 fixtures

- SiamCommercialBankParser.kt only overrides canHandle; all extraction/type/filter logic comes from BaseThailandBankParser.kt and was ported (matching the existing kasikorn-bank.ts/krung-thai-bank.ts ports of the same base class).
- canHandle substring checks 'SIAM COMMERCIAL'/'SIAMCOMMERCIAL' mapped to dltPatterns ^._SIAM COMMERCIAL._$ and ^._SIAMCOMMERCIAL._$; exact sender 'SCB' in dispatch.senders.
- All 3 original SMS bodies from ThailandBankParsersTest.kt preserved verbatim with the original expected values; 2 extra fixtures synthesized (credit-card spending with available limit, Thai deposit) plus OTP and promo FILTER_REJECTED fixtures.
- Transfer-out/transfer-in/deposit fixtures expect REVIEW with MISSING_MERCHANT: the Kotlin parser also returns merchant=null for these formats, but the engine downgrades confidence for missing merchant — same approximation used by the other Thai bank manifests.
- Kotlin isValidMerchantName rejects names containing '@' — not representable in cleaning config; minMerchantLength/commonWords cover the rest.
- Kotlin BigDecimal NumberFormatException fallback-to-next-pattern is not representable; regexes only match valid numbers so behavior is equivalent.

## siddhartha-bank (`np.siddhartha.bank`) — partial, 6/6 fixtures

- All 4 real SMS bodies from SiddharthaBankParserTest.kt preserved verbatim with original expected values; plus the factory-test plain-deposit body and a synthesized OTP rejection fixture.
- Kotlin isTransactionMessage requires contains("npr") AND a transaction keyword; the manifest filter only supports an OR list, so requireAnyKeyword carries the transaction keywords. A keyword-bearing message without "NPR" passes the filter and surfaces as REVIEW/MISSING_AMOUNT instead of being rejected.
- Kotlin merchant resolution is an ordered early-return chain (QR regex > NEA > fund trf (IBFT) > fund trf > deposit). Emulated with one QR extractor plus pipeline setFieldWhen steps guarded by notContainsAny ("qr payment", "nea", "ibft", "fund trf"...). Divergence only if a body contains the literal text "qr payment" but the QR merchant regex fails — Kotlin would fall through to the later branches, the manifest will not.
- Kotlin's NEA branch is a bare contains("nea") substring check; ported as-is (containsAny ["nea"]), so words containing "nea" would also trigger it — same behavior as the original.
- Kotlin extractLast4Digits returns null when fewer than 3 digits are present; the engine's takeLast4 returns whatever digits exist. Irrelevant for the observed AC ###XXXXdddd format.
- Kotlin reference "\(IN-(\d+)" branch prepends "IN-"; the engine cannot prepend, so the capture group includes the literal IN- (re "\\((?<value>IN-\\d+)") — identical output.
- Kotlin canHandle normalizes dashes to underscores then checks contains("SBL")/contains("SIDDHARTHA"); covered by case-insensitive dltPatterns "^._SBL._$" and "^.*SIDDHARTHA.*$" (dash normalization is a no-op for these substrings).
- No balance extraction in the Kotlin parser (its base-class extractBalance fallback is never overridden and no fixture exercises it); omitted.

## south-indian-bank (`in.sib.bank`) — partial, 6/6 fixtures

- All 4 SMS bodies from SouthIndianBankParserTest.kt are preserved verbatim with the original expected values; 2 synthesized REJECTED fixtures (OTP, UPI auto-pay reminder) added.
- Kotlin rejects only the conjunction 'upi auto pay' AND 'is scheduled on'; excludeKeywords cannot express AND, so 'is scheduled on' alone is used (any scheduled-payment reminder is rejected).
- Kotlin's 'UPI Credit'/'UPI Transaction' merchant defaults are reproduced as pipeline setFieldWhen overwrites gated on notContainsAny ['info:','@'] — this also replicates Kotlin's rule that UPI messages never fall through to the debit/credit-between-amount-and-balance or card 'at' patterns, but an Info:UPI message whose Info pattern fails to match would get MISSING_MERCHANT instead of the Kotlin default.
- Kotlin limits the to/from VPA merchant search to the first 200 chars to avoid footer matches; the engine searches the whole body. The patterns require '@', and SIB footers contain only phone numbers, so behavior is equivalent in practice.
- Kotlin hardcodes merchant 'ATM' for ATM/withdrawn messages; the manifest captures the literal 'ATM' token from the body instead, so a 'withdrawn'-only message without the word ATM yields MISSING_MERCHANT (REVIEW) rather than 'ATM'.
- Kotlin's card 'at <merchant>' pattern is gated on contains('card'); the manifest applies it unconditionally as the lowest-priority merchant extractor.
- super.extractX CompiledPatterns fallbacks (generic merchant/reference/account/balance patterns) are not ported — SIB's own patterns cover all known formats; messages relying on the base-class fallbacks would parse with fewer fields.
- Kotlin extracts a transaction date-time ('YY-MM-DD HH:MM:SS') from the body; the manifest engine has no date extraction and always uses the SMS receivedAt timestamp.
- Engine expense-before-income typeRule priority matches Kotlin's debit-before-credit ordering; SIB has no investment branch so typeRules.investment is intentionally omitted.

## standard-chartered-bank (`in.standardchartered.bank`) — partial, 7/7 fixtures

- Merchant template deviation: Kotlin composes the UPI-debit merchant as 'UPI Transfer to XX1465'; the declarative engine can only capture literal body text, so merchant is the destination account token (e.g. 'XX1465'). Fixtures assert the token.
- Filter ordering deviation: the Kotlin override returns true on SC keywords ('is debited for', 'neft credit', etc.) BEFORE the base skip-list runs; the engine always runs excludeKeywords first, so a genuine transaction SMS that also contains a skip word (e.g. 'offer') would be rejected here but accepted by Kotlin. Considered an acceptable edge case.
- Base BankParser fallbacks ported as trailing extractors (generic Rs/INR amount, Available-Balance variant, generic Ref number, generic a/c last4) and as base typeRules keywords; the full CompiledPatterns set and isValidAccountLast4 date/year heuristics are not reproducible declaratively.
- Investment keyword list trimmed to the high-signal subset of the base class list (iccl, nsccl, groww, zerodha, sip, mutual fund, demat); broad substrings like 'nse'/'bse'/'ach' omitted to avoid false positives.
- All 6 real SMS bodies from StandardCharteredBankParserTest.kt are preserved verbatim; expected values match except the merchant template noted above. One synthesized OTP fixture asserts FILTER_REJECTED.

## t-bank (`ru.tbank.bank`) — partial, 5/5 fixtures

- Kopeck truncation: Russian SMS use comma as decimal separator (e.g. balance '10028,05'), but the engine strips commas from amount/balance as thousands separators, which would turn 10028,05 into 1002805. The manifest instead captures only the integer rubles, so balances lose kopecks (Kotlin: 10028.05 -> manifest: '10028'). Original test amounts (5000, 3267, 250) are integers, so amounts are unaffected in all known fixtures.
- Income-before-expense keyword ordering: Kotlin checks income keywords (including 'входящий перевод') before expense keywords ('перевод'); engine typeRules check expense before income, so income keywords are ported as a pipeline setFieldWhen INCOME step that runs before typeRules. Behavior is faithful (verified by the incoming-transfer fixture).
- Filter AND-condition not expressible: Kotlin isTransactionMessage requires BOTH the '₽' sign AND a transaction keyword; the manifest filter only encodes the keyword half (requireAnyKeyword). A keyword message without '₽' passes the filter but yields REVIEW with MISSING_AMOUNT instead of being rejected outright.
- Card detection ordering: Kotlin returns isFromCard=true on 'карта'/'карты' before checking the base excludeKeywords; the engine checks excludes (default a/c, account, saving account) first. No Russian T-Bank message contains those English excludes, so behavior matches in practice.
- Amounts with space thousands separators (e.g. '5 000 ₽') are not supported by the amount regex (would capture only the last digit group); the Kotlin pattern handled them. No original test exercises this format.
- Base BankParser reference/account fallback patterns (English 'ref no', 'a/c X1234' etc. from CompiledPatterns) were not ported since they never match Russian T-Bank SMS; only the parser's own '\*1023' card pattern is included. Reference is never extracted, matching the original tests which expect no reference.
- Fixture bodies for the first three fixtures are verbatim from TestTBankParser.kt with the original expected values (modulo kopeck truncation noted above); the incoming-transfer and OTP fixtures are synthesized from the parser's keyword logic.

## telebirr (`et.telebirr.wallet`) — partial, 11/11 fixtures

- accountLast4: Kotlin extracts the holder name after 'Dear' (e.g. '[Name]'); the engine's accountLast4 is digits-only (takeLast4 normalization), so the manifest uses the wallet pseudo-account fallback '0000' (same rationale as jiopay.ts).
- Merchant 'PERSON NME(2519\***\*2078)': Kotlin inserts a space before the parenthesized phone ('PERSON NME (2519\*\***2078)'); the engine has no replace step, so the raw capture without the inserted space is asserted.
- Government-payment and airtime-package merchants: Kotlin deliberately preserves a trailing space; the engine trims captures, so fixtures assert the trimmed value.
- Fuel merchant: Kotlin preserves the double space in 'plate number 3AA33'; the engine's merchant cleaning collapses whitespace runs, fixture asserts single-spaced value.
- Airtime Pattern 4: Kotlin's two-step capture + reassembly of 'purchase made for N' is replaced by a single lazy capture up to the date terminator, which yields the same string (minus trailing space).
- Filter ordering: Kotlin checks telebirr keywords before the base-class OTP/promo skip list (an OTP mentioning ETB would pass isTransactionMessage and then fail amount extraction); the engine runs excludeKeywords first, so such messages reject as FILTER_REJECTED instead — same net rejection, different reason stage.
- Dispatch contains('127') is ported as an unanchored dltPattern '127', which (faithfully to Kotlin) also matches any sender containing 127.
- BankParser super fallbacks for amount/merchant/balance/reference (INR-centric CompiledPatterns) were not ported; every Telebirr format carries explicit ETB patterns, and all original test messages are covered without them.
- isValidMerchantName/cleanMerchantName guards from Kotlin (which let invalid matches fall through to the next pattern) have no engine equivalent; extractor ordering alone reproduces all known formats.

## tigo-pesa (`tz.tigopesa.wallet`) — partial, 5/5 fixtures

- All 4 original Kotlin test SMS bodies (TanzaniaParserTest.kt) ported verbatim with expected values, plus 1 synthesized FILTER_REJECTED promo fixture.
- Kotlin isTransactionMessage requires 'tsh' AND a transaction keyword; engine filter is OR-only, so the 'tsh' requirement is dropped — a keyword-bearing message without TSh becomes REVIEW (missing amount) instead of REJECTED.
- Kotlin agent pattern captures only the name and re-prefixes 'Agent - '; the manifest captures the 'Agent - NAME' span verbatim, identical output for the canonical 'Agent - NAME' format but 'Agent-NAME' (no spaces) would keep its original spacing.
- Kotlin maps the captured TIPS source token (Selcom/NMB/CRDB) to friendly names; the manifest uses pipeline setFieldWhen keyed on the whole body containing 'from TIPS.' + the bank token, which is equivalent for real messages.
- Engine typeRules priority is expense > income while Kotlin checks income first; no known Tigo Pesa format carries both keyword sets, so no observable difference in fixtures.
- Engine does not run Kotlin's isValidMerchantName fall-through between merchant extractors; first regex match wins. Extractor order matches the Kotlin priority order so all known formats resolve identically.
- Wallet provider: pipeline fallbackField accountLast4 '0000' added (no account number in Tigo Pesa SMS), following the jiopay.ts rationale.

## ttb-bank (`th.ttb.bank`) — ported, 6/6 fixtures

- TTBBankParser.kt is a thin subclass of BaseThailandBankParser; all extraction/type/filter logic was ported from the base class, mirroring the already-ported sibling krungsri-bank.ts for consistency.
- Kotlin canHandle exact-match 'TTB' plus contains('THANACHART')/contains('TMB') mapped to senders ["TTB"] + dltPatterns ["^.*THANACHART.*$", "^.*TMB.*$"]. Note '^._TMB._$' is broader than Kotlin's exact 'TTB' but faithful to the contains('TMB') check.
- Kotlin's isValidMerchantName English common-word rejection (USING/VIA/etc.) is not representable in the manifest; only the Thai connective words are in cleaning.commonWords. None of the fixtures depend on it ('via PromptPay' is not matched by the merchant patterns anyway).
- Both original test SMS bodies from ThailandBankParsersTest.kt are preserved verbatim as fixtures (expected REVIEW + MISSING_MERCHANT since they carry no merchant); 3 fixtures synthesized from base-class regexes plus 1 FILTER_REJECTED OTP fixture.
- India-centric investment keyword list inherited verbatim from BankParser.isInvestmentTransaction, as in the other Thai manifests.

## uae-bank (`ae.uae.bank`) — partial, 6/6 fixtures

- UAEBankParser.kt is an ABSTRACT base class with no canHandle(); dispatch senders/dltPatterns (UAEBANK, UAE-BANK, ^[A-Z]{2}-UAEBNK.\*$) are synthesized placeholders. Its concrete subclasses (EmiratesNBDParser, LivBankParser) already have their own manifests.
- No original tests exist for the abstract class itself, so all 6 fixtures are synthesized from the Kotlin regexes and type when-chain (subclass test bodies belong to the emirates-nbd/liv-bank manifests).
- Kotlin extractCurrency override (per-message currency detection, e.g. USD purchases) is not expressible in the engine; currency is fixed to manifest AED.
- Kotlin month-abbreviation skip in extractAmount is approximated with a negative lookahead (?!JAN|FEB|...) instead of abandoning the pattern on a month match.
- Type classification is done entirely via pipeline setFieldWhen steps in reverse Kotlin priority order (last write wins) because the when-chain interleaves income/expense/transfer priorities that fixed typeRules ordering cannot express.
- Base-class isInvestmentTransaction keyword check (Indian platforms: groww, nse, sip, ach, ...) was intentionally dropped: irrelevant for UAE messages and prone to substring false positives (e.g. 'ach' in 'machine').
- Kotlin compound reminder skip ('pls pay' AND 'min of') cannot be expressed in filter.excludeKeywords and was dropped.
- detectIsCard masked-card check ('ending' + 4-digit regex) approximated by includeKeyword 'ending'.
- Kotlin gates extractAvailableLimit on type CREDIT; the engine always runs creditLimit extractors (harmless: they are Rs-denominated and never match AED bodies).
- Engine takes the first merchant regex match without Kotlin's isValidMerchantName retry-next-pattern loop; base-class date/year accountLast4 validation is also not replicated (engine takeLast4 only).

## uco-bank (`in.uco.bank`) — partial, 5/5 fixtures

- No original Kotlin tests exist for UCOBankParser; all 5 fixtures were synthesized from the parser's doc-comment formats and regexes (2 documented bodies used verbatim).
- Kotlin checks 'debited with'/'credited with' BEFORE the base-class investment-first fallback; replicated via pipeline setFieldWhen steps (which run before typeRules), with 'debited with' last so it wins when both phrases appear, matching the Kotlin when-order.
- BankParser.isTransactionMessage's final OR-fallback to SmsFilter.isTransactionMessage (broad pattern matching) is not expressible in the declarative filter; only the keyword skip-list and positive keyword list were ported.
- Base-class CompiledPatterns fallback lists (Amount/Merchant/Account/Balance/Reference ALL_PATTERNS) were approximated with representative fallback regexes rather than the full compiled set; UCO-specific patterns retain original priority order.
- BankParser.isValidAccountLast4 date/year rejection heuristics were not ported (no engine equivalent); UCO's account patterns are anchored to A/c XX/\*\* masks so the risk is low.

## union-bank (`in.unionbank.bank`) — partial, 6/6 fixtures

- No original Kotlin tests exist for UnionBankParser (grep of parser-core/src/test found nothing), so all 6 fixtures are synthesized from the parser's doc comment SMS format and its regexes.
- Kotlin isTransactionMessage accepts any message containing a transaction keyword even if it contains 'OTP' (Union Bank appends a Never Share OTP/PIN/CVV warning to real transactions). Ported as requireAnyKeyword with NO excludeKeywords, since engine excludeKeywords run before requireAnyKeyword and would wrongly veto the OTP warning text. Consequence: the super.isTransactionMessage fallback (promo/payment-request skips + SmsFilter broad acceptance for keyword-less messages) is not ported; keyword-less transaction messages are FILTER_REJECTED.
- parseUPIMerchant VPA mapping is approximated with pipeline setFieldWhen steps using body-level containsAll ['vpa', <app>] for paytm/phonepe/googlepay/gpay/amazon/swiggy/zomato. Unported branches: bharatpe/flipkart/uber/ola, numeric-VPA -> 'Individual', and the default split/capitalize fallback (engine has no string transforms) — unknown VPAs keep the raw lowercase local part.
- Kotlin's fixed-value merchant branches (Mob Bk -> 'Mobile Banking Transfer', ATM fallback -> 'ATM Withdrawal' with 'at <location>' override) are pipeline steps ordered last-wins to reproduce Kotlin priority Mob Bk > ATM > UPI > VPA > to > from; extract-array order handles the regex branches.
- Kotlin's to/from-merchant guard (reject capture containing 'Avl') is not expressible; the lazy (?:\s+on|\s+Avl|$) terminator makes it moot in practice.
- BankParser investment keyword list ported as a curated subset; short substring-prone keywords (ach, nach, ecs, nse, bse, sip, ipo, cdsl, nsdl, kite, 5paisa, broker names) omitted to avoid false positives (Kotlin itself has the substring-match bug). Kotlin's 'cashback but not earn cashback' income nuance simplified to plain 'cashback'.
- Base-class CompiledPatterns fallbacks for amount/merchant/reference/account/balance are only partially ported: the Union-Bank-specific patterns (which are supersets for its formats) come first, and cleanMerchantName strip patterns (TRAILING_PARENTHESES, REF/DATE/UPI/TIME suffixes, PVT LTD/LTD, trailing dash) are ported to cleaning.stripPatterns. extractAvailableLimit (credit-card limit) not ported — Union Bank SMS formats in the parser are account-based.
- isValidAccountLast4 date/year heuristics are not portable; the manifest's account patterns require an explicit A/c|Account|Acc anchor with \*|X mask, which avoids the date false positives those heuristics guard against.

## uob-thailand (`th.uob.bank`) — ported, 6/6 fixtures

- UOBThailandParser.kt only overrides canHandle/getBankName; all behavior comes from BaseThailandBankParser + BankParser fallbacks, ported the same way as the existing cimb-thai.ts manifest.
- Only one original test SMS exists (UOB card transaction 3,200.00 THB at AMAZON) — used verbatim; the other transaction fixtures are synthesized from the base-class regexes.
- Kotlin returns merchant=null for no-merchant formats and still parses; the engine instead marks those REVIEW with MISSING_MERCHANT — fixtures assert that engine behavior.
- canHandle contains('UOB THAILAND')/contains('UOBTHAI') approximated as dltPatterns ^._UOB\s?THAILAND._$ and ^._UOBTHAI._$ plus exact sender UOB.
- Kotlin extractAvailableLimit is stored in creditLimit by parse(); ported as extract.creditLimit.
- isFromCard is not asserted in fixtures: engine default cardRules differ slightly from Kotlin detectIsCard, matching the convention in cimb-thai.ts.

## utkarsh-bank (`in.utkarsh.card`) — partial, 6/6 fixtures

- No original Kotlin tests exist for UtkarshBankParser; all 6 fixtures are synthesized from the parser's regexes and doc comments (4 parsed + 2 FILTER_REJECTED).
- Kotlin's supercard+upi -> "UPI Payment" special case runs only when merchant patterns 1/2 fail; the engine cannot condition a setFieldWhen on field state, so it is approximated with notContainsAny:["for "] (both patterns 1 and 2 require a 'for ' phrase). A message containing 'for ' where both patterns still fail would get the base-pattern/"Utkarsh SuperCard" result instead of "UPI Payment".
- Kotlin pattern 1 rejects 'for UPI - <token>' captures matching [x0-9]+ (lowercase x only, post-match); approximated with a lookahead requiring a non-x letter under the engine's case-insensitive flag, so uppercase-X-only tokens (e.g. 'X1234') are also skipped where Kotlin would accept them.
- BankParser.isTransactionMessage falls back to SmsFilter.isTransactionMessage for broad matching; the manifest only ports the explicit transaction keyword list (debited/credited/withdrawn/deposited/spent/received/transferred/paid) as requireAnyKeyword, so SmsFilter-only formats would be FILTER_REJECTED.
- The Kotlin compound skip ("pls pay" AND "min of") cannot be expressed in filter.excludeKeywords (no AND support) and was omitted; the broader 'min amount due'/'is due'/'ignore if paid' excludes cover the realistic cases.
- detectIsCard's masked-number heuristic ('ending' + \d{4} regex) is not portable; cardRules keyword lists port the explicit include/exclude lists, which still classify 'SuperCard xx1234' as card via the 'card xx'/'card x' substrings, matching Kotlin.
- extractTransactionType always returns CREDIT in Kotlin; ported as pipeline fallbackField transactionType=CREDIT (runs before typeRules classification, so 'debited'/'received' keywords never reclassify), matching the one-card.ts precedent.

## yes-bank (`in.yesbank.bank`) — partial, 10/10 fixtures

- All 4 transaction bodies and all 4 rejection bodies from YesBankParserTest.kt preserved verbatim; expected values match the Kotlin test expectations (amounts/creditLimit normalized without commas).
- Filter ordering deviation: the engine runs excludeKeywords before requireAnyKeyword unconditionally, while Kotlin checks Yes Bank's own skip-list, then yesBankKeywords, then the base skip-list. A genuine card spend that also contains a word like 'offer' or 'is due' would be rejected here but parsed by Kotlin. No fixture exercises this edge.
- CREDIT classification (spent + 'yes bank card' + 'avl lmt') is ported as a pipeline setFieldWhen step with a notContainsAny guard covering a subset of investment keywords (groww/zerodha/upstox/mutual fund/demat/iccl/nsccl) to approximate Kotlin's isInvestmentTransaction-first priority; the full Kotlin investment list cannot be expressed in the condition without noise.
- Investment keyword list curated: dropped collision-prone bare substrings 'ach', 'nse', 'bse', 'kite' from the base-class list (Kotlin has the same substring false-positive bug; dropping them is the safer approximation).
- Card detection deviation: the engine checks cardRules.excludeKeywords (a/c, account variants) before includeKeywords, while Kotlin's YesBankParser returns true for 'yes bank card'/'sms blkcc' before the base account exclusion. A message with both 'yes bank card' and 'a/c' would get isFromCard=false here, true in Kotlin.
- Engine extracts creditLimit for every message; Kotlin only extracts available limit when type == CREDIT. Harmless for fixtures since only card messages contain 'Avl Lmt INR'.
- Base-class isValidMerchantName and isValidAccountLast4 date/year validation are not enforced per-extractor by the engine (first regex match wins); fallback merchant/account regexes were ordered to minimize impact.
- The two non-card fixtures (account debit/credit via base-class fallback patterns) are synthesized, since the original test suite only covers the credit-card UPI format.

## zemen-bank (`et.zemen.bank`) — partial, 7/7 fixtures

- No original Kotlin tests exist for ZemenBankParser (only TestTelebirrParser mentions Zemen as a merchant), so all 7 fixtures are synthesized from the parser's regexes and narrative shapes.
- Kotlin's parseScaledAmount setScale(2, HALF_UP) is not reproducible: the engine keeps the raw matched digits, so 'ETB 100' would parse as '100' not '100.00'. Fixtures use decimal-bearing amounts so expected values match both behaviors.
- Kotlin checks Zemen credited keywords before any debit phrase; replicated via a pipeline setFieldWhen INCOME step (runs before typeRules), with the '(transferred && from a/c)' EXPENSE rule as a second setFieldWhen guarded by notContainsAny credited phrases.
- Filter approximation: Kotlin's isTransactionMessage accepts a message containing any Zemen keyword (e.g. 'etb') even if it also contains 'otp', because the keyword check precedes super's skip list. The manifest's excludeKeywords (otp/one time password/verification code/offer/discount) run first, so an OTP message mentioning ETB would be rejected here but accepted by Kotlin. Judged a safe-direction deviation.
- Base BankParser CompiledPatterns fallbacks (generic amount/merchant/account/balance/reference) were not ported; Zemen's own patterns cover every documented format and all messages carry ETB/Birr-tagged amounts.
- Engine applies cleaning.stripPatterns to every merchant extraction, whereas Kotlin only ran cleanMerchantName on the 'from X with reference' and POS-purchase patterns; the strip patterns are narrow suffix matchers (trailing parens/dash, PVT LTD/LTD) so other merchants are unaffected.
- Kotlin's isValidMerchantName guard on the generic 'from X with reference' pattern is not enforced by the engine (it accepts the first regex match).
- File written: /Users/vijayabaskar/work/unmiser/lib/parser/manifests/zemen-bank.ts; bun scripts/validate-manifest.ts prints 'OK et.zemen.bank: 7 fixtures pass' and oxlint reports no issues.
