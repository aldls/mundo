let progress = 0;
const loadingBar = document.getElementById('loadingBar');
const percentageText = document.getElementById('percentage');

// Simulate loading progress (you can replace this with actual loading logic)
const interval = setInterval(() => {
  progress += 1;
  loadingBar.style.width = `${progress}%`;
  percentageText.textContent = `${progress}%`;

  if (progress >= 100) {
    clearInterval(interval); // Stop the interval once loading is complete
    // You can redirect the user or perform another action after completion
    setTimeout(() => {
      window.location.href = '/dashboard'; // Example: Redirect to the dashboard page
    }, 500);
  }
}, 10); // Increase by 1% every 100ms
