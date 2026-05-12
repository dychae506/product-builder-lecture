document.addEventListener('DOMContentLoaded', () => {
    const drawBtn = document.getElementById('draw-btn');
    const ballsContainer = document.getElementById('balls-container');

    // 동행복권 기준 색상
    function getBallColorClass(number) {
        if (number >= 1 && number <= 10) return 'color-yellow';
        if (number >= 11 && number <= 20) return 'color-blue';
        if (number >= 21 && number <= 30) return 'color-red';
        if (number >= 31 && number <= 40) return 'color-gray';
        if (number >= 41 && number <= 45) return 'color-green';
        return 'color-gray';
    }

    function generateLottoNumbers() {
        const numbers = new Set();
        while (numbers.size < 6) {
            numbers.add(Math.floor(Math.random() * 45) + 1);
        }
        return Array.from(numbers).sort((a, b) => a - b);
    }

    // Web Audio API 팡파레
    function playFanfare() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            
            function playNote(frequency, startTime, duration, vol=0.3) {
                const oscillator = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                
                oscillator.type = 'triangle';
                oscillator.frequency.value = frequency;
                
                oscillator.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                
                oscillator.start(startTime);
                
                gainNode.gain.setValueAtTime(0, startTime);
                gainNode.gain.linearRampToValueAtTime(vol, startTime + 0.05);
                gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
                
                oscillator.stop(startTime + duration);
            }

            const now = audioCtx.currentTime;
            // 솔-솔-솔-도-솔-도 (간단한 팡파레)
            playNote(392.00, now, 0.15);       // G4
            playNote(392.00, now + 0.15, 0.15); // G4
            playNote(392.00, now + 0.3, 0.15);  // G4
            playNote(523.25, now + 0.45, 0.4);  // C5
            playNote(392.00, now + 0.85, 0.2);  // G4
            playNote(523.25, now + 1.05, 0.6);  // C5
        } catch(e) {
            console.log("Audio not supported");
        }
    }

    function fireConfetti() {
        var duration = 3 * 1000;
        var animationEnd = Date.now() + duration;
        var defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };

        var interval = setInterval(function() {
            var timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            var particleCount = 50 * (timeLeft / duration);
            confetti({
                ...defaults, particleCount,
                origin: { x: Math.random(), y: Math.random() - 0.2 }
            });
        }, 250);
    }

    async function drawNumbers() {
        // 축하 메시지 숨기기
        document.getElementById('celebration-msg').classList.remove('show');

        // 버튼 비활성화
        drawBtn.disabled = true;
        drawBtn.textContent = '추첨 진행 중...';

        // 컨테이너 초기화
        ballsContainer.innerHTML = '';

        const winningNumbers = generateLottoNumbers();

        for (let i = 0; i < winningNumbers.length; i++) {
            const number = winningNumbers[i];
            
            // 공 생성
            const ball = document.createElement('div');
            ball.className = `ball ${getBallColorClass(number)}`;
            
            const textSpan = document.createElement('span');
            textSpan.textContent = number;
            ball.appendChild(textSpan);
            
            ballsContainer.appendChild(ball);

            // 애니메이션을 위해 약간 대기
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // DOM 업데이트 후 클래스 추가하여 애니메이션 트리거
            requestAnimationFrame(() => {
                ball.classList.add('show');
            });

            // 다음 공이 나오기 전까지 대기 (타격감 있는 딜레이)
            await new Promise(resolve => setTimeout(resolve, 450));
        }

        // 추첨 완료 후 이벤트
        playFanfare();
        fireConfetti();
        document.getElementById('celebration-msg').classList.add('show');

        // 버튼 다시 활성화
        drawBtn.disabled = false;
        drawBtn.textContent = '다시 추첨하기';
    }

    drawBtn.addEventListener('click', drawNumbers);
});
