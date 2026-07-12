import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { paginate } from './paginated';
import { PaginationQueryDto } from './pagination.dto';

describe('PaginationQueryDto', () => {
  const make = (input: Record<string, unknown>) =>
    plainToInstance(PaginationQueryDto, input, { enableImplicitConversion: true });

  it('defaults to page 1, limit 20', () => {
    const dto = make({});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    expect(dto.skip).toBe(0);
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('computes skip from page and limit', () => {
    const dto = make({ page: '3', limit: '25' });
    expect(dto.skip).toBe(50);
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects a limit above the 100 cap (DoS guard)', () => {
    expect(validateSync(make({ limit: 5000 }))).not.toHaveLength(0);
  });

  it('rejects zero/negative pages', () => {
    expect(validateSync(make({ page: 0 }))).not.toHaveLength(0);
    expect(validateSync(make({ page: -2 }))).not.toHaveLength(0);
  });

  it('rejects non-integer input', () => {
    expect(validateSync(make({ page: 'abc' }))).not.toHaveLength(0);
  });
});

describe('paginate', () => {
  it('builds the standard envelope', () => {
    const result = paginate(['a', 'b'], 42, { page: 2, limit: 2 });
    expect(result).toEqual({
      data: ['a', 'b'],
      meta: { total: 42, page: 2, limit: 2, totalPages: 21 },
    });
  });

  it('rounds total pages up', () => {
    expect(paginate([], 41, { page: 1, limit: 20 }).meta.totalPages).toBe(3);
  });

  it('is zero-safe', () => {
    expect(paginate([], 0, { page: 1, limit: 20 }).meta.totalPages).toBe(0);
    expect(paginate([], 10, { page: 1, limit: 0 }).meta.totalPages).toBe(0);
  });
});
