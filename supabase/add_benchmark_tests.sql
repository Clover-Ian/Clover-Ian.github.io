-- 让排行榜接受新的三个测试：numbers / sequence / aim
-- Supabase → SQL Editor 执行一次。

alter table public.benchmark_scores
  drop constraint if exists benchmark_scores_test_check;

alter table public.benchmark_scores
  add constraint benchmark_scores_test_check
  check (test in ('reaction', 'click', 'typing', 'numbers', 'sequence', 'aim'));
