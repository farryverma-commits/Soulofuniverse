package ffmpeg

import (
	"bufio"
	"strconv"
	"strings"
)

// ParseProgress consumes ffmpeg -progress key=value lines and calls onProgress
// with 0-100 percentages derived from out_time_ms against durationSecs. The
// final "progress=end" forces 100. Unknown lines are ignored; a non-positive
// duration disables percentage computation (calls still fire 100 on end).
func ParseProgress(scanner *bufio.Scanner, durationSecs float64, onProgress func(int)) {
	if onProgress == nil {
		for scanner.Scan() {
		}
		return
	}
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		kv := strings.SplitN(line, "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch strings.TrimSpace(kv[0]) {
		case "out_time_ms":
			if durationSecs <= 0 {
				continue
			}
			ms, err := strconv.ParseInt(strings.TrimSpace(kv[1]), 10, 64)
			if err != nil || ms < 0 {
				continue
			}
			p := int(float64(ms) / 1e6 / durationSecs * 100)
			onProgress(clamp(p))
		case "progress":
			if strings.TrimSpace(kv[1]) == "end" {
				onProgress(100)
			}
		}
	}
}

func clamp(p int) int {
	if p < 0 {
		return 0
	}
	if p > 100 {
		return 100
	}
	return p
}
