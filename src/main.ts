import { invoke } from "@tauri-apps/api/core";

interface Record {
  id?: number;
  student_id: string;
  name: string;
  reason: string;
  points: number;
  point_type: string;
  timestamp: string;
  date: string;
}

interface Summary {
  student_id: string;
  name: string;
  merit: number;
  demerit: number;
  offset: number;
  total: number;
  last_activity: string;
}

class ToastManager {
  private container: HTMLElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
  }

  show(message: string, type: 'success' | 'error', duration: number = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'success' ? '✓' : '✕';
    
    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-message">${message}</div>
      <button class="toast-close">&times;</button>
    `;

    this.container.appendChild(toast);

    const closeBtn = toast.querySelector('.toast-close') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => this.remove(toast));

    setTimeout(() => this.remove(toast), duration);
  }

  private remove(toast: HTMLElement) {
    toast.classList.add('removing');
    setTimeout(() => {
      if (toast.parentNode) {
        this.container.removeChild(toast);
      }
    }, 200);
  }
}

class App {
  private viewMode: 'summary' | 'detail' = 'summary';
  private searchTerm: string = '';
  private toast: ToastManager;
  private currentRecords: Record[] = [];

  constructor() {
    this.toast = new ToastManager();
    this.init();
  }

  init() {
    this.renderLogin();
  }

  renderLogin() {
    document.getElementById('app')!.innerHTML = `
      <div class="container">
        <div class="login-container">
          <h1 class="login-title">상벌점 관리</h1>
          <form id="login-form">
            <div class="form-group">
              <label for="password">비밀번호</label>
              <input type="password" id="password" required>
            </div>
            <div class="form-buttons">
              <button type="submit" class="btn btn-primary">로그인</button>
              <button type="button" class="btn btn-secondary" id="change-password-btn">비밀번호 변경</button>
            </div>
            <div id="login-error" class="error hidden"></div>
          </form>
        </div>
      </div>
    `;

    const loginForm = document.getElementById('login-form') as HTMLFormElement;
    const passwordInput = document.getElementById('password') as HTMLInputElement;
    const changePasswordBtn = document.getElementById('change-password-btn') as HTMLButtonElement;
    const errorDiv = document.getElementById('login-error') as HTMLDivElement;

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const isValid = await invoke<boolean>('login', { password: passwordInput.value });
        if (isValid) {
          this.renderMain();
        } else {
          errorDiv.textContent = '잘못된 비밀번호입니다';
          errorDiv.classList.remove('hidden');
          passwordInput.value = '';
        }
      } catch (error) {
        errorDiv.textContent = '로그인 중 오류가 발생했습니다';
        errorDiv.classList.remove('hidden');
      }
    });

    changePasswordBtn.addEventListener('click', () => {
      this.showChangePasswordModal();
    });

    passwordInput.focus();
  }

  renderMain() {
    document.getElementById('app')!.innerHTML = `
      <div class="app-content">
        <div class="header">
          <h1>상벌점 관리</h1>
          <div class="header-buttons">
            <button class="btn btn-export" id="export-excel">Excel 내보내기</button>
            <button class="btn btn-danger" id="reset-btn">데이터 초기화</button>
            <button class="btn btn-secondary" id="logout-btn">로그아웃</button>
          </div>
        </div>
        
        <div class="main-content">
          <div class="sidebar">
            <div class="section">
              <div class="section-title">정보 입력</div>
              <form id="record-form">
                <div class="form-row">
                  <div class="form-group">
                    <label for="student-id">학번</label>
                    <input type="text" id="student-id" required>
                  </div>
                  <div class="form-group">
                    <label for="name">이름</label>
                    <input type="text" id="name" required>
                  </div>
                  <div class="form-group">
                    <label for="points">점수</label>
                    <input type="number" id="points" min="1" required>
                  </div>
                </div>
                <div class="form-group">
                  <label for="reason">사유</label>
                  <input type="text" id="reason" required>
                </div>
                <div class="form-group">
                  <label for="date">날짜</label>
                  <input type="date" id="date">
                </div>
                <div class="form-buttons">
                  <button type="button" class="btn btn-primary" data-type="상점">상점</button>
                  <button type="button" class="btn btn-danger" data-type="벌점">벌점</button>
                  <button type="button" class="btn btn-secondary" data-type="상쇄점">상쇄점</button>
                  <button type="button" class="btn btn-secondary" id="clear-form">초기화</button>
                </div>
              </form>
            </div>

            <div class="section">
              <div class="section-title">통계</div>
              <div class="stats-grid">
                <div class="stat-card">
                  <div class="stat-value" id="total-students">0</div>
                  <div class="stat-label">학생수</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value" id="total-records">0</div>
                  <div class="stat-label">기록수</div>
                </div>
              </div>
            </div>
          </div>

          <div class="content-area">
            <div class="controls">
              <input type="text" id="search" class="search-input" placeholder="검색...">
              
              <div class="radio-group">
                <label>
                  <input type="radio" name="view-mode" value="summary" checked>
                  요약
                </label>
                <label>
                  <input type="radio" name="view-mode" value="detail">
                  전체
                </label>
              </div>
              
              <button class="btn btn-secondary" id="refresh-btn">새로고침</button>
            </div>

            <div class="table-container">
              <table id="data-table">
                <thead id="table-header"></thead>
                <tbody id="table-body"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindMainEvents();
    this.loadData();
    this.updateStats();
  }

  bindMainEvents() {
    const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement;
    const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
    const clearFormBtn = document.getElementById('clear-form') as HTMLButtonElement;
    const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
    const exportBtn = document.getElementById('export-excel') as HTMLButtonElement;
    const searchInput = document.getElementById('search') as HTMLInputElement;
    const viewModeInputs = document.querySelectorAll('input[name="view-mode"]') as NodeListOf<HTMLInputElement>;
    const pointButtons = document.querySelectorAll('[data-type]') as NodeListOf<HTMLButtonElement>;

    logoutBtn.addEventListener('click', () => {
      this.renderLogin();
    });

    resetBtn.addEventListener('click', () => {
      this.showResetConfirm();
    });

    clearFormBtn.addEventListener('click', () => {
      this.clearForm();
    });

    refreshBtn.addEventListener('click', () => {
      this.loadData();
      this.updateStats();
      this.toast.show('새로고침 완료', 'success', 2000);
    });

    exportBtn.addEventListener('click', () => {
      this.exportToExcel();
    });

    searchInput.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      this.searchTerm = target.value;
      this.loadData();
    });

    viewModeInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        this.viewMode = target.value as 'summary' | 'detail';
        this.loadData();
      });
    });

    pointButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLButtonElement;
        const pointType = target.getAttribute('data-type')!;
        this.addRecord(pointType);
      });
    });

    const dataTable = document.getElementById('data-table') as HTMLTableElement;
    dataTable.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const row = target.closest('tr');
      if (row && this.viewMode === 'summary') {
        const studentId = row.cells[0].textContent!;
        const name = row.cells[1].textContent!;
        this.showStudentDetails(studentId, name);
      }
    });
  }

  async addRecord(pointType: string) {
    const studentId = (document.getElementById('student-id') as HTMLInputElement).value.trim();
    const name = (document.getElementById('name') as HTMLInputElement).value.trim();
    const points = parseInt((document.getElementById('points') as HTMLInputElement).value);
    const reason = (document.getElementById('reason') as HTMLInputElement).value.trim();
    const dateInput = (document.getElementById('date') as HTMLInputElement).value;

    if (!studentId || !name || !reason || isNaN(points) || points <= 0) {
      this.toast.show('모든 항목을 입력하세요', 'error');
      return;
    }

    try {
      await invoke('add_record', {
        studentId,
        name,
        reason,
        points,
        pointType,
        date: dateInput || null
      });

      this.toast.show(`${pointType} ${points}점 추가됨`, 'success');
      this.clearForm();
      this.loadData();
      this.updateStats();
    } catch (error) {
      this.toast.show(`오류: ${error}`, 'error');
    }
  }

  clearForm() {
    (document.getElementById('student-id') as HTMLInputElement).value = '';
    (document.getElementById('name') as HTMLInputElement).value = '';
    (document.getElementById('points') as HTMLInputElement).value = '';
    (document.getElementById('reason') as HTMLInputElement).value = '';
    (document.getElementById('date') as HTMLInputElement).value = '';
  }

  async loadData() {
    try {
      if (this.viewMode === 'summary') {
        const data = this.searchTerm ? 
          await invoke<Summary[]>('search_summary', { term: this.searchTerm }) :
          await invoke<Summary[]>('get_summary');
        this.renderSummaryTable(data);
      } else {
        const data = this.searchTerm ?
          await invoke<Record[]>('search_records', { term: this.searchTerm }) :
          await invoke<Record[]>('get_records');
        this.currentRecords = data;
        this.renderDetailTable(data);
      }
    } catch (error) {
      console.error('데이터 로드 오류:', error);
      this.toast.show('데이터 로드 실패', 'error');
    }
  }

  async updateStats() {
    try {
      const [summaryData, recordsData] = await Promise.all([
        invoke<Summary[]>('get_summary'),
        invoke<Record[]>('get_records')
      ]);

      const totalStudentsEl = document.getElementById('total-students');
      const totalRecordsEl = document.getElementById('total-records');

      if (totalStudentsEl) totalStudentsEl.textContent = summaryData.length.toString();
      if (totalRecordsEl) totalRecordsEl.textContent = recordsData.length.toString();
    } catch (error) {
      console.error('통계 업데이트 오류:', error);
    }
  }

  renderSummaryTable(data: Summary[]) {
    const header = document.getElementById('table-header') as HTMLTableSectionElement;
    const body = document.getElementById('table-body') as HTMLTableSectionElement;

    header.innerHTML = `
      <tr>
        <th>학번</th>
        <th>이름</th>
        <th>상점</th>
        <th>벌점</th>
        <th>상쇄점</th>
        <th>총점</th>
        <th>최근활동</th>
      </tr>
    `;

    body.innerHTML = data.map(row => `
      <tr>
        <td>${row.student_id}</td>
        <td>${row.name}</td>
        <td>${row.merit}</td>
        <td>${row.demerit}</td>
        <td>${row.offset}</td>
        <td class="${row.total >= 0 ? 'positive' : 'negative'}">${row.total >= 0 ? '+' : ''}${row.total}</td>
        <td>${row.last_activity}</td>
      </tr>
    `).join('');
  }

  renderDetailTable(data: Record[]) {
    const header = document.getElementById('table-header') as HTMLTableSectionElement;
    const body = document.getElementById('table-body') as HTMLTableSectionElement;

    header.innerHTML = `
      <tr>
        <th>학번</th>
        <th>이름</th>
        <th>유형</th>
        <th>사유</th>
        <th>점수</th>
        <th>날짜</th>
        <th>작업</th>
      </tr>
    `;

    body.innerHTML = data.map(row => `
      <tr>
        <td>${row.student_id}</td>
        <td>${row.name}</td>
        <td>${row.point_type}</td>
        <td style="text-align: left;">${row.reason}</td>
        <td class="${row.points >= 0 ? 'positive' : 'negative'}">${row.points >= 0 ? '+' : ''}${row.points}</td>
        <td>${row.date}</td>
        <td>
          <button class="btn-small btn-edit" onclick="window.app.editRecord(${row.id})">수정</button>
          <button class="btn-small btn-delete" onclick="window.app.deleteRecord(${row.id})">삭제</button>
        </td>
      </tr>
    `).join('');
  }

  async exportToExcel() {
    try {
      const data = this.viewMode === 'summary' ? 
        await invoke<Summary[]>('get_summary') :
        await invoke<Record[]>('get_records');

      let csvContent = '';
      
      if (this.viewMode === 'summary') {
        csvContent = '학번,이름,상점,벌점,상쇄점,총점,최근활동\n';
        csvContent += (data as Summary[]).map(row => 
          `${row.student_id},${row.name},${row.merit},${row.demerit},${row.offset},${row.total},${row.last_activity}`
        ).join('\n');
      } else {
        csvContent = '학번,이름,유형,사유,점수,날짜\n';
        csvContent += (data as Record[]).map(row => 
          `${row.student_id},${row.name},${row.point_type},"${row.reason}",${row.points},${row.date}`
        ).join('\n');
      }

      const bom = '\uFEFF';
      const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
      
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `상벌점_${this.viewMode === 'summary' ? '요약' : '전체'}_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      this.toast.show('Excel 다운로드 완료', 'success');
    } catch (error) {
      this.toast.show('Excel 내보내기 실패', 'error');
    }
  }

  async showStudentDetails(studentId: string, name: string) {
    try {
      const records = await invoke<Record[]>('get_student_details', { studentId });
      
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">${name}(${studentId}) 상세</h2>
            <button class="close-btn">&times;</button>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>유형</th>
                  <th>점수</th>
                  <th>사유</th>
                </tr>
              </thead>
              <tbody>
                ${records.map(record => `
                  <tr>
                    <td>${record.date}</td>
                    <td>${record.point_type}</td>
                    <td class="${record.points >= 0 ? 'positive' : 'negative'}">${record.points >= 0 ? '+' : ''}${record.points}</td>
                    <td style="text-align: left;">${record.reason}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const closeBtn = modal.querySelector('.close-btn') as HTMLButtonElement;
      closeBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          document.body.removeChild(modal);
        }
      });
    } catch (error) {
      this.toast.show(`상세 정보 로드 실패: ${error}`, 'error');
    }
  }

  showChangePasswordModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title">비밀번호 변경</h2>
          <button class="close-btn">&times;</button>
        </div>
        <form id="change-password-form">
          <div class="form-group">
            <label for="old-password">현재 비밀번호</label>
            <input type="password" id="old-password" required>
          </div>
          <div class="form-group">
            <label for="new-password">새 비밀번호</label>
            <input type="password" id="new-password" required minlength="3">
          </div>
          <div class="form-buttons">
            <button type="submit" class="btn btn-primary">변경</button>
            <button type="button" class="btn btn-secondary" id="cancel-change">취소</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const form = modal.querySelector('#change-password-form') as HTMLFormElement;
    const closeBtn = modal.querySelector('.close-btn') as HTMLButtonElement;
    const cancelBtn = modal.querySelector('#cancel-change') as HTMLButtonElement;

    const closeModal = () => {
      document.body.removeChild(modal);
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const oldPassword = (modal.querySelector('#old-password') as HTMLInputElement).value;
      const newPassword = (modal.querySelector('#new-password') as HTMLInputElement).value;

      try {
        const result = await invoke<boolean>('change_password', { oldPassword, newPassword });
        if (result) {
          this.toast.show('비밀번호 변경됨', 'success');
          closeModal();
        } else {
          this.toast.show('현재 비밀번호 오류', 'error');
        }
      } catch (error) {
        this.toast.show(`오류: ${error}`, 'error');
      }
    });

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  showResetConfirm() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title">데이터 초기화</h2>
          <button class="close-btn">&times;</button>
        </div>
        <div style="margin-bottom: 12px;">
          <p>모든 데이터를 초기화하시겠습니까?</p>
          <p style="color: #586069; font-size: 11px; margin-top: 4px;">백업이 생성됩니다.</p>
        </div>
        <div class="form-buttons">
          <button class="btn btn-danger" id="confirm-reset">확인</button>
          <button class="btn btn-secondary" id="cancel-reset">취소</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('.close-btn') as HTMLButtonElement;
    const confirmBtn = modal.querySelector('#confirm-reset') as HTMLButtonElement;
    const cancelBtn = modal.querySelector('#cancel-reset') as HTMLButtonElement;

    const closeModal = () => {
      document.body.removeChild(modal);
    };

    confirmBtn.addEventListener('click', async () => {
      try {
        await invoke('reset_data');
        this.toast.show('데이터 초기화 완료', 'success');
        this.loadData();
        this.updateStats();
        closeModal();
      } catch (error) {
        this.toast.show(`초기화 실패: ${error}`, 'error');
      }
    });

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  async editRecord(recordId: number) {
    const record = this.currentRecords.find(r => r.id === recordId);
    if (!record) {
      this.toast.show('기록을 찾을 수 없습니다', 'error');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title">기록 수정</h2>
          <button class="close-btn">&times;</button>
        </div>
        <form id="edit-record-form">
          <div class="form-row">
            <div class="form-group">
              <label for="edit-student-id">학번</label>
              <input type="text" id="edit-student-id" value="${record.student_id}" required>
            </div>
            <div class="form-group">
              <label for="edit-name">이름</label>
              <input type="text" id="edit-name" value="${record.name}" required>
            </div>
            <div class="form-group">
              <label for="edit-points">점수</label>
              <input type="number" id="edit-points" value="${Math.abs(record.points)}" min="1" required>
            </div>
          </div>
          <div class="form-group">
            <label for="edit-reason">사유</label>
            <input type="text" id="edit-reason" value="${record.reason}" required>
          </div>
          <div class="form-group">
            <label for="edit-point-type">유형</label>
            <select id="edit-point-type" required>
              <option value="상점" ${record.point_type === '상점' ? 'selected' : ''}>상점</option>
              <option value="벌점" ${record.point_type === '벌점' ? 'selected' : ''}>벌점</option>
              <option value="상쇄점" ${record.point_type === '상쇄점' ? 'selected' : ''}>상쇄점</option>
            </select>
          </div>
          <div class="form-group">
            <label for="edit-date">날짜</label>
            <input type="date" id="edit-date" value="${record.date}" required>
          </div>
          <div class="form-buttons">
            <button type="submit" class="btn btn-primary">수정</button>
            <button type="button" class="btn btn-secondary" id="cancel-edit">취소</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const form = modal.querySelector('#edit-record-form') as HTMLFormElement;
    const closeBtn = modal.querySelector('.close-btn') as HTMLButtonElement;
    const cancelBtn = modal.querySelector('#cancel-edit') as HTMLButtonElement;

    const closeModal = () => {
      document.body.removeChild(modal);
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const studentId = (modal.querySelector('#edit-student-id') as HTMLInputElement).value.trim();
      const name = (modal.querySelector('#edit-name') as HTMLInputElement).value.trim();
      const points = parseInt((modal.querySelector('#edit-points') as HTMLInputElement).value);
      const reason = (modal.querySelector('#edit-reason') as HTMLInputElement).value.trim();
      const pointType = (modal.querySelector('#edit-point-type') as HTMLSelectElement).value;
      const date = (modal.querySelector('#edit-date') as HTMLInputElement).value;

      if (!studentId || !name || !reason || isNaN(points) || points <= 0 || !date) {
        this.toast.show('모든 항목을 입력하세요', 'error');
        return;
      }

      try {
        await invoke('update_record', {
          id: recordId,
          studentId,
          name,
          reason,
          points,
          pointType,
          date
        });

        this.toast.show('기록이 수정되었습니다', 'success');
        closeModal();
        this.loadData();
        this.updateStats();
      } catch (error) {
        this.toast.show(`수정 실패: ${error}`, 'error');
      }
    });

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  async deleteRecord(recordId: number) {
    const record = this.currentRecords.find(r => r.id === recordId);
    if (!record) {
      this.toast.show('기록을 찾을 수 없습니다', 'error');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title">기록 삭제</h2>
          <button class="close-btn">&times;</button>
        </div>
        <div style="margin-bottom: 12px;">
          <p><strong>${record.name}(${record.student_id})</strong>의 다음 기록을 삭제하시겠습니까?</p>
          <p style="color: #586069; font-size: 11px; margin-top: 8px;">
            ${record.point_type} ${Math.abs(record.points)}점 - ${record.reason} (${record.date})
          </p>
          <p style="color: #d73a49; font-size: 11px; margin-top: 4px;">이 작업은 되돌릴 수 없습니다.</p>
        </div>
        <div class="form-buttons">
          <button class="btn btn-danger" id="confirm-delete">삭제</button>
          <button class="btn btn-secondary" id="cancel-delete">취소</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('.close-btn') as HTMLButtonElement;
    const confirmBtn = modal.querySelector('#confirm-delete') as HTMLButtonElement;
    const cancelBtn = modal.querySelector('#cancel-delete') as HTMLButtonElement;

    const closeModal = () => {
      document.body.removeChild(modal);
    };

    confirmBtn.addEventListener('click', async () => {
      try {
        await invoke('delete_record', { id: recordId });
        this.toast.show('기록이 삭제되었습니다', 'success');
        this.loadData();
        this.updateStats();
        closeModal();
      } catch (error) {
        this.toast.show(`삭제 실패: ${error}`, 'error');
      }
    });

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }
}

declare global {
  interface Window {
    app: App;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.app = new App();
});