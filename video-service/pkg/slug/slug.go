// Package slug ports video-engine's generate_slug and display-title helpers.
package slug

import (
	"strings"
	"unicode"
)

// Generate converts a raw upload filename into a URL-safe slug.
// Faithful port of the Python original: strip the last extension, drop every
// character that is not a word char, whitespace or hyphen, collapse runs of
// [-_whitespace] into a single hyphen, lowercase.
func Generate(filename string) string {
	stem := filename
	if i := strings.LastIndex(stem, "."); i >= 0 {
		stem = stem[:i]
	}
	var kept strings.Builder
	kept.Grow(len(stem))
	for _, r := range stem {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			kept.WriteRune(r)
		case r == '_' || r == '-' || unicode.IsSpace(r):
			kept.WriteRune(r)
		}
	}
	cleaned := strings.TrimSpace(kept.String())
	var out strings.Builder
	out.Grow(len(cleaned))
	inSep := false
	for _, r := range cleaned {
		if r == '_' || r == '-' || unicode.IsSpace(r) {
			if !inSep {
				out.WriteByte('-')
				inSep = true
			}
			continue
		}
		inSep = false
		out.WriteRune(r)
	}
	return strings.ToLower(out.String())
}

// DisplayTitle ports the Python display-title rule:
// underscores become spaces, everything from the first dot is dropped.
func DisplayTitle(filename string) string {
	s := strings.ReplaceAll(filename, "_", " ")
	if i := strings.Index(s, "."); i >= 0 {
		return s[:i]
	}
	return s
}
