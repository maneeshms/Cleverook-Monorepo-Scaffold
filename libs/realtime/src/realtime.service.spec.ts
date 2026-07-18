import { RealtimeService } from './realtime.service';
import type { Server } from 'socket.io';

describe('RealtimeService', () => {
  let service: RealtimeService;
  let emit: jest.Mock;
  let to: jest.Mock;
  let server: Server;

  beforeEach(() => {
    service = new RealtimeService();
    emit = jest.fn();
    to = jest.fn().mockReturnValue({ emit });
    server = { to, emit } as unknown as Server;
  });

  it('reports false (best-effort, never throws) before the gateway binds a server', () => {
    expect(service.emitToUser('u1', 'notification', {})).toBe(false);
    expect(service.emitToAll('announce', {})).toBe(false);
  });

  it('emits to exactly the per-user room once bound', () => {
    service.bind(server);
    expect(service.emitToUser('u1', 'notification', { id: 'n1' })).toBe(true);
    expect(to).toHaveBeenCalledWith('user:u1');
    expect(emit).toHaveBeenCalledWith('notification', { id: 'n1' });
  });

  it('broadcasts to every socket with emitToAll', () => {
    service.bind(server);
    expect(service.emitToAll('announce', { msg: 'hi' })).toBe(true);
    expect(server.emit).toHaveBeenCalledWith('announce', { msg: 'hi' });
    expect(to).not.toHaveBeenCalled();
  });

  it('derives room names as user:<id>', () => {
    expect(RealtimeService.userRoom('abc')).toBe('user:abc');
  });
});
