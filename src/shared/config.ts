/**
 * Host 与 Client 共用的配置值形状 (纯数据, 无 import).
 * @module dsh-load-shell-env/shared/config
 */

/** 流水线里的一级. */
export interface StageConfig {
  /** 一条完整的 POSIX sh 命令行; 必须自己输出 NUL 分隔的 `KEY=VALUE`. */
  command: string
  /** 省略时按 true 处理; 显式 false 表示这一级被留档但不参与读取. */
  enabled?: boolean
}
