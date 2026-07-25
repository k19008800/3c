// ============================================================
//  3cloud (3C) — 监控告警API路由
//  /api/v1/admin/monitoring/*
// ============================================================

import { FastifyInstance } from "fastify";
import { monitoringService } from "../services/monitoring-service/index.js";
import { alertService } from "../services/alert-service/index.js";
import { z } from "zod";

// Schema定义
const AlertRuleSchema = z.object({
  type: z.enum(['api_response_time', 'api_error_rate', 'database_connection', 'redis_health', 'disk_usage', 'memory_usage']),
  threshold: z.number().min(0),
  severity: z.enum(['critical', 'warning', 'info']),
  enabled: z.boolean().default(true)
});

const AlertFilterSchema = z.object({
  type: z.string().optional(),
  severity: z.string().optional(),
  acknowledged: z.boolean().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0)
});

const NotificationConfigSchema = z.object({
  emailEnabled: z.boolean().optional(),
  emailRecipients: z.array(z.string().email()).optional(),
  webhookEnabled: z.boolean().optional(),
  webhookUrl: z.string().url().optional(),
  smsEnabled: z.boolean().optional(),
  smsPhoneNumbers: z.array(z.string()).optional(),
  pushEnabled: z.boolean().optional(),
  pushTokens: z.array(z.string()).optional()
});

export async function monitoringRoutes(fastify: FastifyInstance) {
  // 前缀：/api/v1/admin/monitoring
  const prefix = '/api/v1/admin/monitoring';

  // ============================================================
  //  监控指标API
  // ============================================================

  // 获取当前监控指标
  fastify.get(`${prefix}/metrics`, {
    schema: {
      tags: ['monitoring'],
      summary: '获取当前监控指标',
      description: '获取系统各项监控指标的当前值',
      response: {
        200: {
          type: 'object',
          properties: {
            metrics: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  value: { type: 'number' },
                  timestamp: { type: 'string', format: 'date-time' }
                }
              }
            },
            timestamp: { type: 'string', format: 'date-time' }
          }
        }
      }
    }
  }, async () => {
    const metrics = await monitoringService.collectMetrics();
    return {
      metrics,
      timestamp: new Date().toISOString()
    };
  });

  // ============================================================
  //  告警规则API
  // ============================================================

  // 获取所有告警规则
  fastify.get(`${prefix}/rules`, {
    schema: {
      tags: ['monitoring'],
      summary: '获取所有告警规则',
      description: '获取系统中配置的所有告警规则',
      response: {
        200: {
          type: 'object',
          properties: {
            rules: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string' },
                  threshold: { type: 'number' },
                  severity: { type: 'string' },
                  enabled: { type: 'boolean' },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' }
                }
              }
            }
          }
        }
      }
    }
  }, async () => {
    const rules = await monitoringService.getAlertRules();
    return { rules };
  });

  // 创建告警规则
  fastify.post(`${prefix}/rules`, {
    schema: {
      tags: ['monitoring'],
      summary: '创建告警规则',
      description: '创建新的告警规则',
      body: {
        type: 'object',
        required: ['type', 'threshold', 'severity'],
        properties: {
          type: { type: 'string' },
          threshold: { type: 'number' },
          severity: { type: 'string' },
          enabled: { type: 'boolean' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            rule: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                type: { type: 'string' },
                threshold: { type: 'number' },
                severity: { type: 'string' },
                enabled: { type: 'boolean' },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const body = AlertRuleSchema.parse(request.body);
    const rule = await monitoringService.createAlertRule(body);
    reply.code(201);
    return { rule };
  });

  // 更新告警规则
  fastify.patch(`${prefix}/rules/:id`, {
    schema: {
      tags: ['monitoring'],
      summary: '更新告警规则',
      description: '更新指定ID的告警规则',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          threshold: { type: 'number' },
          severity: { type: 'string' },
          enabled: { type: 'boolean' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request) => {
    const { id } = request.params as { id: string };
    const updates = request.body as any;
    await monitoringService.updateAlertRule(id, updates);
    return { success: true };
  });

  // ============================================================
  //  告警事件API
  // ============================================================

  // 获取告警列表
  fastify.get(`${prefix}/alerts`, {
    schema: {
      tags: ['monitoring'],
      summary: '获取告警列表',
      description: '获取系统中的告警事件列表',
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          severity: { type: 'string' },
          acknowledged: { type: 'boolean' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          limit: { type: 'number', minimum: 1, maximum: 100 },
          offset: { type: 'number', minimum: office0 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            alerts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string' },
                  severity: { type: 'string' },
                  message: { type: 'string' },
                  value: { type: 'number' },
                  threshold: { type: 'number' },
                  timestamp: { type: 'string', format: 'date-time' },
                  acknowledged: { type: 'boolean' },
                  acknowledgedAt: { type: 'string', format: 'date-time' },
                  createdAt: { type: 'string', format: 'date-time' }
                }
              }
            },
            total: { type: 'number' }
          }
        }
      }
    }
  }, async (request) => {
    const filters = AlertFilterSchema.parse(request.query);
    const result = await monitoringService.getAlerts({
      ...filters,
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined
    });
    return result;
  });

  // 确认告警
  fastify.post(`${prefix}/alerts/:id/acknowledge`, {
    schema: {
      tags: ['monitoring'],
      summary: '确认告警',
      description: '确认指定的告警事件',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request) => {
    const { id } = request.params as { id: string };
    await monitoringService.acknowledgeAlert(id);
    return { success: true };
  });

  // ============================================================
  //  监控统计API
  // ============================================================

  // 获取监控统计信息
  fastify.get(`${prefix}/stats`, {
    schema: {
      tags: ['monitoring'],
      summary: '获取监控统计信息',
      description: '获取监控系统的统计数据和趋势',
      response: {
        200: {
          type: 'object',
          properties: {
            totalAlerts: { type: 'number' },
            unacknowledgedAlerts: { type: 'number' },
            criticalAlerts: { type: 'number' },
            warningAlerts: { type: 'number' },
            alertsByType: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  count: { type: 'number' }
                }
              }
            },
            recentAlertsTrend: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  hour: { type: 'string' },
                  count: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  }, async () => {
    const stats = await monitoringService.getMonitoringStats();
    return stats;
  });

  // ============================================================
  //  告警通知配置API
  // ============================================================

  // 获取告警通知配置
  fastify.get(`${prefix}/notifications/config`, {
    schema: {
      tags: ['monitoring'],
      summary: '获取告警通知配置',
      description: '获取告警通知的配置信息',
      response: {
        200: {
          type: 'object',
          properties: {
            config: {
              type: 'object',
              properties: {
                emailEnabled: { type: 'boolean' },
                emailRecipients: { type: 'array', items: { type: 'string' } },
                webhookEnabled: { type: 'boolean' },
                webhookUrl: { type: 'string' },
                smsEnabled: { type: 'boolean' },
                smsPhoneNumbers: { type: 'array', items: { type: 'string' } },
                pushEnabled: { type: 'boolean' },
                pushTokens: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        }
      }
    }
  }, async () => {
    const config = alertService.getNotificationConfig();
    return { config };
  });

  // 更新告警通知配置
  fastify.put(`${prefix}/notifications/config`, {
    schema: {
      tags: ['monitoring'],
      summary: '更新告警通知配置',
      description: '更新告警通知的配置信息',
      body: {
        type: 'object',
        properties: {
          emailEnabled: { type: 'boolean' },
          emailRecipients: { type: 'array', items: { type: 'string' } },
          webhookEnabled: { type: 'boolean' },
          webhookUrl: { type: 'string' },
          smsEnabled: { type: 'boolean' },
          smsPhoneNumbers: { type: 'array', items: { type: 'string' } },
          pushEnabled: { type: 'boolean' },
          pushTokens: { type: 'array', items: { type: 'string' } }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request) => {
    const config = NotificationConfigSchema.parse(request.body);
    await alertService.updateNotificationConfig(config);
    return { success: true };
  });

  // 测试告警通知渠道
  fastify.post(`${prefix}/notifications/test/:channel`, {
    schema: {
      tags: ['monitoring'],
      summary: '测试告警通知渠道',
      description: '测试指定的告警通知渠道是否正常工作',
      params: {
        type: 'object',
        properties: {
          channel: { type: 'string', enum: ['email', 'webhook', 'sms', 'push'] }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request) => {
    const { channel } = request.params as { channel: 'email' | 'webhook' | 'sms' | 'push' };
    const success = await alertService.testNotificationChannel(channel);
    return {
      success,
      message: success ? '测试成功' : '测试失败'
    };
  });

  // ============================================================
  //  实时监控API（WebSocket）
  // ============================================================

  // WebSocket实时监控
  fastify.get(`${prefix}/realtime`, { websocket: true }, (connection, req) => {
    connection.socket.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        // 处理不同类型的消息
        switch (data.type) {
          case 'subscribe':
            // 订阅监控数据
            startSendingMetrics(connection.socket);
            break;
          case 'unsubscribe':
            // 取消订阅
            stopSendingMetrics(connection.socket);
            break;
          case 'acknowledge':
            // 确认告警
            monitoringService.acknowledgeAlert(data.alertId);
            break;
        }
      } catch (error) {
        connection.socket.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });

    connection.socket.on('close', () => {
      stopSendingMetrics(connection.socket);
    });
  });

  // 发送监控数据的定时器
  const connections = new Set<WebSocket>();
  let intervalId: NodeJS.Timeout | null = null;

  function startSendingMetrics(socket: WebSocket) {
    connections.add(socket);
    
    if (!intervalId) {
      intervalId = setInterval(async () => {
        if (connections.size === 0) {
          clearInterval(intervalId!);
          intervalId = null;
          return;
        }

        try {
          const metrics = await monitoringService.collectMetrics();
          const alerts = await monitoringService.checkAlerts(metrics);
          
          const data = {
            type: 'metrics',
            timestamp: new Date().toISOString(),
            metrics,
            alerts
          };

          // 发送给所有连接的客户端
          for (const conn of connections) {
            if (conn.readyState === WebSocket.OPEN) {
              conn.send(JSON.stringify(data));
            }
          }
        } catch (error) {
          console.error('发送实时监控数据失败:', error);
        }
      }, 5000); // 5秒发送一次
    }
  }

  function stopSendingMetrics(socket: WebSocket) {
    connections.delete(socket);
  }
}