import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TemplateService } from './template.service';
import { MessageTemplate } from '../entities/message-template.entity';
import { Channel } from '../enums/channel.enum';

describe('TemplateService', () => {
  let service: TemplateService;
  let repo: { findOne: jest.Mock };

  beforeEach(async () => {
    repo = { findOne: jest.fn().mockResolvedValue(null) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateService,
        { provide: getRepositoryToken(MessageTemplate), useValue: repo },
      ],
    }).compile();
    service = module.get(TemplateService);
  });

  it('renders the in-code default and interpolates variables', async () => {
    const out = await service.render('PHONE_OTP', Channel.SMS, { code: '135790', ttlMinutes: 10 });
    expect(out.text).toContain('135790');
    expect(out.text).toContain('10 min');
  });

  it('lets a DB override win over the code default', async () => {
    repo.findOne.mockResolvedValue({
      subject: 'Custom {{code}}',
      bodyHtml: '<p>{{code}}</p>',
      bodyText: 'code={{code}}',
      enabled: true,
    });
    const out = await service.render('EMAIL_VERIFICATION', Channel.EMAIL, { code: 'ABC' });
    expect(out.subject).toBe('Custom ABC');
    expect(out.html).toBe('<p>ABC</p>');
    expect(out.text).toBe('code=ABC');
  });

  it('renders unknown variables as empty strings (never leaks the token)', async () => {
    const out = await service.render('PHONE_OTP', Channel.SMS, { code: '111' });
    expect(out.text).not.toContain('{{');
    expect(out.text).not.toContain('ttlMinutes');
  });

  it('throws when no template exists for the channel', async () => {
    await expect(service.render('PHONE_OTP', Channel.EMAIL, {})).rejects.toThrow();
  });

  it('throws for a completely unknown template key', async () => {
    await expect(service.render('NOPE', Channel.EMAIL, {})).rejects.toThrow(/No template 'NOPE'/);
  });

  it('maps null DB columns to undefined parts', async () => {
    repo.findOne.mockResolvedValue({
      subject: null,
      bodyHtml: null,
      bodyText: 'only text {{v}}',
      enabled: true,
    });
    const out = await service.render('WELCOME', Channel.EMAIL, { v: 'x' });
    expect(out.subject).toBeUndefined();
    expect(out.html).toBeUndefined();
    expect(out.text).toBe('only text x');
  });

  it('renders null variable values as empty strings', async () => {
    repo.findOne.mockResolvedValue({
      subject: 'S',
      bodyHtml: null,
      bodyText: 'a{{gone}}b',
      enabled: true,
    });
    const out = await service.render('WELCOME', Channel.EMAIL, { gone: null });
    expect(out.text).toBe('ab');
  });

  it('HTML-escapes interpolated values in the html variant (no markup injection)', async () => {
    repo.findOne.mockResolvedValue({
      subject: 'hi {{name}}',
      bodyHtml: '<p>Hi {{name}}</p>',
      bodyText: 'Hi {{name}}',
      enabled: true,
    });
    const evil = '</p><img src=x onerror=alert(1)>';
    const out = await service.render('WELCOME', Channel.EMAIL, { name: evil });
    // html escaped — the payload can't break out of the <p> or add a tag
    expect(out.html).toBe('<p>Hi &lt;/p&gt;&lt;img src=x onerror=alert(1)&gt;</p>');
    expect(out.html).not.toContain('<img');
    // subject + text are NOT HTML contexts — left as-is
    expect(out.text).toBe(`Hi ${evil}`);
    expect(out.subject).toBe(`hi ${evil}`);
  });
});
