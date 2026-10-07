/// Order totals engine: discounts, service charge, VAT, cash rounding and bill splitting.
///
/// A port of `packages/pricing` (TypeScript). Both versions must give identical results;
/// the shared fixtures in `packages/pricing/fixtures` check that. Rules: docs/totals-rules.md.
library;

export 'src/money.dart';
export 'src/split.dart';
export 'src/totals.dart';
