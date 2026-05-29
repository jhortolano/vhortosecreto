#!/bin/bash
ASSETS="/Volumes/dev/Projects/React/VhortoSecreto/assets/images"
SIZE=1024
HALF=$((SIZE/2))

# Clean slate
rm -f "$ASSETS"/icon.png "$ASSETS"/android-icon-*.png "$ASSETS"/splash-icon.png "$ASSETS"/favicon.png

# Base: blue rounded square
magick -size ${SIZE}x${SIZE} xc:'#1F6FEB' "$ASSETS/_base.png"

# Ballot box (white rectangle with rounded bottom)
magick "$ASSETS/_base.png" -fill '#FFFFFF' -draw "roundrectangle 180,480 844,920 40,40" "$ASSETS/_step1.png"

# Slot in ballot box
magick "$ASSETS/_step1.png" -fill '#1F6FEB' -draw "rectangle 300,475 724,505" "$ASSETS/_step2.png"

# Envelope body (white)
magick "$ASSETS/_step2.png" -fill '#FFFFFF' -draw "roundrectangle 262,260 762,490 20,20" "$ASSETS/_step3.png"

# Envelope flap (triangle)
magick "$ASSETS/_step3.png" -fill '#D0E4FF' -draw "polygon 262,260 512,390 762,260" "$ASSETS/_step4.png"

# Envelope bottom flap
magick "$ASSETS/_step4.png" -fill '#B0CFF5' -draw "polygon 262,490 512,390 762,490" "$ASSETS/_step5.png"

# Lines on envelope (address lines)
magick "$ASSETS/_step5.png" -fill '#1F6FEB' -draw "rectangle 330,320 694,335" -draw "rectangle 380,355 644,370" -draw "rectangle 330,390 580,405" "$ASSETS/_step6.png"

# Hand: palm oval
magick "$ASSETS/_step6.png" -fill '#FCE4D6' -draw "ellipse 420,120 80,100 0,360" -draw "ellipse 510,110 70,90 0,360" -draw "ellipse 600,120 75,95 0,360" "$ASSETS/_step7.png"

# Hand: thumb
magick "$ASSETS/_step7.png" -fill '#FCE4D6' -draw "ellipse 340,150 35,70 -15,340" "$ASSETS/_step8.png"

# Sleeve
magick "$ASSETS/_step8.png" -fill '#2D7DED' -draw "roundrectangle 380,220 620,320 15,15" "$ASSETS/_step9.png"

# Final icon
cp "$ASSETS/_step9.png" "$ASSETS/icon.png"

# Android foreground (transparent bg)
magick "$ASSETS/_step9.png" -transparent '#1F6FEB' "$ASSETS/android-icon-foreground.png"

# Android background
magick -size ${SIZE}x${SIZE} xc:'#E6F4FE' "$ASSETS/android-icon-background.png"

# Android monochrome
magick "$ASSETS/android-icon-foreground.png" -colorspace Gray "$ASSETS/android-icon-monochrome.png"

# Splash (smaller)
magick "$ASSETS/icon.png" -resize 400x400 "$ASSETS/splash-icon.png"

# Favicon
magick "$ASSETS/icon.png" -resize 48x48 "$ASSETS/favicon.png"

# Cleanup
rm -f "$ASSETS"/_*.png

echo "Done"
ls -la "$ASSETS"/{icon.png,android-*.png,splash-icon.png,favicon.png}
