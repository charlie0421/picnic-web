/**
 * Web Worker 유틸리티
 * 무거운 작업을 메인 스레드에서 분리하여 성능 최적화
 */

interface WorkerTask<T = any, R = any> {
  id: string;
  type: string;
  data: T;
  resolve: (value: R) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

interface WorkerMessage<T = any> {
  id: string;
  type: string;
  data: T;
  error?: string;
}

class WebWorkerManager {
  private workers: Map<string, Worker> = new Map();
  private tasks: Map<string, WorkerTask> = new Map();
  private workerPool: Worker[] = [];
  private maxWorkers: number = navigator.hardwareConcurrency || 4;
  private currentWorkerIndex: number = 0;

  constructor() {
    this.initializeWorkerPool();
  }

  /**
   * Worker Pool 초기화
   */
  private initializeWorkerPool() {
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = this.createWorker();
      this.workerPool.push(worker);
    }
  }

  /**
   * Worker 생성
   */
  private createWorker(): Worker {
    const workerCode = `
      // 데이터 처리 함수들
      const processors = {
        // 대용량 데이터 필터링
        filterData: (data) => {
          const { items, filterFn } = data;
          return items.filter(eval(filterFn));
        },

        // 데이터 정렬
        sortData: (data) => {
          const { items, sortKey, direction = 'asc' } = data;
          return items.sort((a, b) => {
            const aVal = a[sortKey];
            const bVal = b[sortKey];
            if (direction === 'asc') {
              return aVal > bVal ? 1 : -1;
            } else {
              return aVal < bVal ? 1 : -1;
            }
          });
        },

        // 데이터 그룹화
        groupData: (data) => {
          const { items, groupKey } = data;
          return items.reduce((groups, item) => {
            const key = item[groupKey];
            if (!groups[key]) {
              groups[key] = [];
            }
            groups[key].push(item);
            return groups;
          }, {});
        },

        // 통계 계산
        calculateStats: (data) => {
          const { items, field } = data;
          const values = items.map(item => item[field]).filter(val => typeof val === 'number');
          
          if (values.length === 0) return null;
          
          const sum = values.reduce((acc, val) => acc + val, 0);
          const avg = sum / values.length;
          const min = Math.min(...values);
          const max = Math.max(...values);
          const variance = values.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / values.length;
          const stdDev = Math.sqrt(variance);
          
          return { sum, avg, min, max, count: values.length, variance, stdDev };
        },

        // 이미지 처리
        processImage: (data) => {
          const { imageData, operation } = data;
          // 간단한 이미지 처리 로직
          return imageData;
        },

        // 문자열 검색
        searchText: (data) => {
          const { items, searchTerm, searchFields } = data;
          const term = searchTerm.toLowerCase();
          
          return items.filter(item => {
            return searchFields.some(field => {
              const value = item[field];
              return value && value.toString().toLowerCase().includes(term);
            });
          });
        },

        // JSON 파싱/직렬화
        parseJson: (data) => {
          try {
            return JSON.parse(data.jsonString);
          } catch (error) {
            throw new Error('Invalid JSON: ' + error.message);
          }
        },

        stringifyJson: (data) => {
          return JSON.stringify(data.object, null, data.indent || 0);
        }
      };

      // 메시지 처리
      self.onmessage = function(event) {
        const { id, type, data } = event.data;
        
        try {
          if (processors[type]) {
            const result = processors[type](data);
            self.postMessage({ id, type, data: result });
          } else {
            throw new Error('Unknown task type: ' + type);
          }
        } catch (error) {
          self.postMessage({ id, type, error: error.message });
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      this.handleWorkerMessage(event.data);
    };

    worker.onerror = (error) => {
      console.error('Worker error:', error);
    };

    return worker;
  }

  /**
   * Worker 메시지 처리
   */
  private handleWorkerMessage(message: WorkerMessage) {
    const task = this.tasks.get(message.id);
    if (!task) return;

    this.tasks.delete(message.id);

    if (message.error) {
      task.reject(new Error(message.error));
    } else {
      task.resolve(message.data);
    }
  }

  /**
   * 다음 사용 가능한 Worker 선택
   */
  private getNextWorker(): Worker {
    const worker = this.workerPool[this.currentWorkerIndex];
    this.currentWorkerIndex = (this.currentWorkerIndex + 1) % this.workerPool.length;
    return worker;
  }

  /**
   * 작업 실행
   */
  async executeTask<T, R>(type: string, data: T, timeout = 30000): Promise<R> {
    return new Promise((resolve, reject) => {
      const id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const task: WorkerTask<T, R> = {
        id,
        type,
        data,
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.tasks.set(id, task);

      // 타임아웃 설정
      const timeoutId = setTimeout(() => {
        this.tasks.delete(id);
        reject(new Error(`Worker task timeout: ${type}`));
      }, timeout);

      // 타임아웃 해제를 위한 원래 resolve/reject 래핑
      const originalResolve = task.resolve;
      const originalReject = task.reject;

      task.resolve = (value: R) => {
        clearTimeout(timeoutId);
        originalResolve(value);
      };

      task.reject = (error: Error) => {
        clearTimeout(timeoutId);
        originalReject(error);
      };

      // Worker에게 작업 전송
      const worker = this.getNextWorker();
      worker.postMessage({ id, type, data });
    });
  }

  /**
   * 모든 Worker 종료
   */
  terminate() {
    this.workerPool.forEach(worker => worker.terminate());
    this.workerPool = [];
    this.tasks.clear();
  }

  /**
   * 진행 중인 작업 수
   */
  get pendingTasks(): number {
    return this.tasks.size;
  }

  /**
   * Worker Pool 상태
   */
  get status() {
    return {
      maxWorkers: this.maxWorkers,
      activeWorkers: this.workerPool.length,
      pendingTasks: this.tasks.size
    };
  }
}

// 싱글톤 인스턴스
const workerManager = new WebWorkerManager();

/**
 * 대용량 데이터 필터링
 */
export async function filterDataAsync<T>(
  items: T[], 
  filterFn: (item: T) => boolean,
  timeout?: number
): Promise<T[]> {
  return workerManager.executeTask('filterData', {
    items,
    filterFn: filterFn.toString()
  }, timeout);
}

/**
 * 데이터 정렬
 */
export async function sortDataAsync<T>(
  items: T[],
  sortKey: keyof T,
  direction: 'asc' | 'desc' = 'asc',
  timeout?: number
): Promise<T[]> {
  return workerManager.executeTask('sortData', {
    items,
    sortKey,
    direction
  }, timeout);
}

/**
 * 데이터 그룹화
 */
export async function groupDataAsync<T>(
  items: T[],
  groupKey: keyof T,
  timeout?: number
): Promise<Record<string, T[]>> {
  return workerManager.executeTask('groupData', {
    items,
    groupKey
  }, timeout);
}

/**
 * 통계 계산
 */
export async function calculateStatsAsync<T>(
  items: T[],
  field: keyof T,
  timeout?: number
): Promise<{
  sum: number;
  avg: number;
  min: number;
  max: number;
  count: number;
  variance: number;
  stdDev: number;
} | null> {
  return workerManager.executeTask('calculateStats', {
    items,
    field
  }, timeout);
}

/**
 * 문자열 검색
 */
export async function searchTextAsync<T>(
  items: T[],
  searchTerm: string,
  searchFields: (keyof T)[],
  timeout?: number
): Promise<T[]> {
  return workerManager.executeTask('searchText', {
    items,
    searchTerm,
    searchFields
  }, timeout);
}

/**
 * JSON 파싱
 */
export async function parseJsonAsync(
  jsonString: string,
  timeout?: number
): Promise<any> {
  return workerManager.executeTask('parseJson', {
    jsonString
  }, timeout);
}

/**
 * JSON 직렬화
 */
export async function stringifyJsonAsync(
  object: any,
  indent?: number,
  timeout?: number
): Promise<string> {
  return workerManager.executeTask('stringifyJson', {
    object,
    indent
  }, timeout);
}

/**
 * Worker Manager 직접 접근
 */
export { workerManager };

/**
 * 정리 함수 (앱 종료 시 호출)
 */
export function cleanup() {
  workerManager.terminate();
}

// 브라우저 종료 시 정리
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanup);
} 