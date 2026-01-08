import {
  Controller,
  Get,
  Delete,
  Param,
  UseGuards,
  Post,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get('my-sessions')
  getActiveSessions(@CurrentUser() user: any) {
    return this.sessionsService.findUserSessions(user.id);
  }

  @Get('stats')
  getSessionStats(@CurrentUser() user: any) {
    return this.sessionsService.getSessionStats(user.id);
  }

  @Post('logout')
  logout(@Request() req: any, @CurrentUser() user: any) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    return this.sessionsService.logout(token, user.id);
  }

  @Delete(':sessionId')
  logoutSession(@Param('sessionId', ParseUUIDPipe) sessionId: string, @CurrentUser() user: any) {
    return this.sessionsService.logoutSession(sessionId, user.id);
  }

  @Post('logout-all')
  logoutAllSessions(@CurrentUser() user: any) {
    return this.sessionsService.logoutAllSessions(user.id); // logout all sessions
  }

  @Post('logout-all-except-current')
  logoutAllExceptCurrent(@Request() req: any, @CurrentUser() user: any) {
    const currentToken = req.headers.authorization?.replace('Bearer ', '');
    return this.sessionsService.logoutAllSessions(user.id, currentToken); // keep current session
  }
}
