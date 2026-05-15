// Stock/stock.js

document.addEventListener('DOMContentLoaded', () => {
    const fetchBtn = document.getElementById('fetchBtn');
    const loaderContainer = document.getElementById('loaderContainer');
    const tableWrapper = document.getElementById('tableWrapper');
    const tableBody = document.getElementById('stockTableBody');
    const errorMessage = document.getElementById('errorMessage');
    const actionBar = document.querySelector('.action-bar');

    async function fetchStockData() {
        // UI 상태 업데이트
        fetchBtn.disabled = true;
        tableWrapper.style.display = 'none';
        errorMessage.style.display = 'none';
        loaderContainer.style.display = 'flex';
        
        try {
            // 백엔드 API 호출
            const response = await fetch('http://localhost:3000/api/mystock');
            const result = await response.json();

            if (response.ok && result.success) {
                renderTable(result.data);
                tableWrapper.style.display = 'block';
                // 데이터 로드 완료 후 버튼 바 다시 표시 (필요시)
                if (actionBar) actionBar.style.display = 'flex';
            } else {
                throw new Error(result.error || '데이터를 가져오는데 실패했습니다.');
            }
        } catch (error) {
            console.error('Fetch error:', error);
            if (error.message.includes('Failed to fetch')) {
                errorMessage.textContent = '서버에 연결할 수 없습니다. 백엔드 서버(server.js)가 3000번 포트에서 실행 중인지 확인해 주세요.';
            } else {
                errorMessage.textContent = '오류 발생: ' + error.message;
            }
            errorMessage.style.display = 'block';
            // 에러 발생 시에도 버튼 바 다시 표시하여 재시도 가능하게 함
            if (actionBar) actionBar.style.display = 'flex';
        } finally {
            loaderContainer.style.display = 'none';
            fetchBtn.disabled = false;
        }
    }

    // URL 파라미터 확인하여 자동 실행
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('autoFetch') === 'true') {
        // 자동 실행 시에는 버튼 바를 처음에 숨김
        if (actionBar) actionBar.style.display = 'none';
        fetchStockData();
    }

    fetchBtn.addEventListener('click', fetchStockData);

    function renderTable(data) {
        tableBody.innerHTML = '';

        if (data.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="10" class="empty-state">관심종목 데이터가 없습니다. 네이버 관심종목에 종목을 추가해주세요.</td>
                </tr>
            `;
            return;
        }

        data.forEach(stock => {
            const tr = document.createElement('tr');
            
            // 색상 클래스 결정 (상승/하락)
            let changeClass = 'steady';
            if (stock.changeRate.includes('+')) changeClass = 'up';
            else if (stock.changeRate.includes('-')) changeClass = 'down';

            tr.innerHTML = `
                <td class="stock-name-cell"><strong>${stock.name}</strong></td>
                <td>${stock.currentPrice}</td>
                <td class="${changeClass}">${stock.change}</td>
                <td class="${changeClass}">${stock.changeRate}</td>
                <td>${stock.open}</td>
                <td>${stock.high}</td>
                <td>${stock.low}</td>
                <td>${stock.volume}</td>
                <td>${stock.tradeValue}</td>
                <td>${stock.marketCap}</td>
            `;
            tableBody.appendChild(tr);
        });
    }
});
