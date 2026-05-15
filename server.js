const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

const USER_DATA_PATH = path.resolve(__dirname, '.puppeteer_user_data');
if (!fs.existsSync(USER_DATA_PATH)) {
    fs.mkdirSync(USER_DATA_PATH, { recursive: true });
}

app.use(cors());
app.use(express.json());

let globalBrowser = null;
let isScraping = false;

async function getBrowser(headless = true) {
    if (globalBrowser) {
        try {
            await globalBrowser.version();
            const args = globalBrowser.process().spawnargs;
            const isCurrentlyHeadless = args.some(arg => arg.includes('headless'));
            if (isCurrentlyHeadless === (headless || headless === "new")) return globalBrowser;
            await globalBrowser.close();
        } catch (e) {
            globalBrowser = null;
        }
    }
    globalBrowser = await puppeteer.launch({
        headless: headless ? "new" : false,
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        userDataDir: USER_DATA_PATH,
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
            '--no-sandbox', '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            '--lang=ko-KR'
        ]
    });
    return globalBrowser;
}

app.get('/api/mystock', async (req, res) => {
    if (isScraping) return res.status(429).json({ error: '데이터 수집 중입니다.' });
    isScraping = true;
    let page = null;
    
    try {
        let browser = await getBrowser(true);
        page = await browser.newPage();
        await page.goto('https://finance.naver.com/mystock/itemList.naver', { waitUntil: 'networkidle2', timeout: 45000 });

        if (page.url().includes('nid.naver.com')) {
            await page.close();
            browser = await getBrowser(false);
            page = await browser.newPage();
            await page.goto('https://finance.naver.com/mystock/itemList.naver', { waitUntil: 'networkidle2' });
            await page.waitForFunction(() => window.location.href.includes('finance.naver.com/mystock'), { timeout: 300000 });
            await new Promise(r => setTimeout(r, 5000));
        }

        // 스크롤 다운
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0; let distance = 200;
                let timer = setInterval(() => {
                    let scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= scrollHeight) { clearInterval(timer); resolve(); }
                }, 100);
            });
        });
        await new Promise(r => setTimeout(r, 2000));

        let finalData = await page.evaluate(() => {
            // 1. 모든 테이블을 가져옴
            const tables = Array.from(document.querySelectorAll('table'));
            let stockResult = [];
            let seen = new Set();
            let stopAll = false;

            for (const table of tables) {
                if (stopAll) break;
                
                // 테이블 헤더 확인 (종목명이 포함된 테이블만 처리)
                const ths = Array.from(table.querySelectorAll('thead th'));
                const hNames = ths.map(th => th.innerText.trim());
                if (!hNames.some(n => n.includes('종목'))) continue;

                const rows = Array.from(table.querySelectorAll('tbody tr'));
                for (const row of rows) {
                    // --- 긴급 중단 조건 (사용자 제보 패턴) ---
                    const text = row.innerText || '';
                    // 날짜 형식(XX.XX XX:XX)이 포함되어 있거나 '종목토론' 텍스트가 있으면 즉시 종료
                    if (/\d{2}\.\d{2}\s\d{2}:\d{2}/.test(text) || text.includes('종목토론') || text.includes('관심뉴스')) {
                        if (stockResult.length > 0) { stopAll = true; break; }
                        continue;
                    }

                    const tds = Array.from(row.querySelectorAll('td'));
                    if (tds.length < 5) continue;

                    // 체크박스 필수 (관심종목의 유일한 특징)
                    const hasCheckbox = row.querySelector('input[type="checkbox"]');
                    if (!hasCheckbox) {
                        if (stockResult.length > 0) { stopAll = true; break; }
                        continue;
                    }

                    // 진짜 종목 상세 페이지 링크인지 확인
                    let name = ''; let tdNameIdx = -1; let isStock = false;
                    for (let j = 0; j < tds.length; j++) {
                        const a = tds[j].querySelector('a');
                        if (a && a.getAttribute('href')?.includes('item/main.')) {
                            name = a.innerText.trim();
                            tdNameIdx = j;
                            isStock = true;
                            break;
                        }
                    }

                    if (!isStock || !name || seen.has(name) || name.length > 20) {
                        if (stockResult.length > 0) { stopAll = true; break; }
                        continue;
                    }

                    // 가격 수치 검증 (날짜 점 필터링)
                    let thNameIdx = hNames.findIndex(n => n.includes('종목') || n === '');
                    const offset = tdNameIdx - (thNameIdx === -1 ? 1 : thNameIdx);
                    
                    const rowData = { '_name': name };
                    let currentPrice = '';
                    hNames.forEach((hName, idx) => {
                        if (!hName) return;
                        const tIdx = idx + offset;
                        if (tds[tIdx]) {
                            const val = tds[tIdx].innerText.trim().replace(/\s+/g, '');
                            rowData[hName] = val;
                            if (hName.includes('현재가')) currentPrice = val;
                        }
                    });

                    // 현재가가 숫자가 아니거나 점(.)이 포함되어 있으면(날짜) 종료
                    const purePrice = currentPrice.replace(/,/g, '');
                    if (/^\d+$/.test(purePrice) && purePrice.length > 0) {
                        seen.add(name);
                        stockResult.push(rowData);
                    } else {
                        if (stockResult.length > 0) { stopAll = true; break; }
                    }
                }
            }
            return stockResult;
        });

        await page.close(); isScraping = false;
        const mappedData = finalData.map(item => {
            const getV = (ks) => {
                for (const k of ks) if (item[k] && item[k] !== '-') return item[k];
                return '-';
            };
            return {
                name: item['_name'], currentPrice: getV(['현재가']),
                change: getV(['전일비', '전일대비']), changeRate: getV(['등락률']),
                open: getV(['시가']), high: getV(['고가']), low: getV(['저가']),
                volume: getV(['거래량']), tradeValue: getV(['거래대금']), marketCap: getV(['시가총액'])
            };
        });
        res.json({ success: true, data: mappedData });

    } catch (error) {
        console.error('에러:', error);
        if (page) await page.close().catch(() => {});
        isScraping = false;
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
