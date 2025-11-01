import { Canvas } from "@react-three/fiber"
import { Container, Fullscreen, Text } from "@react-three/uikit"
import { OrbitControls } from "@react-three/drei"
import { inconsolata } from "@pmndrs/msdfonts"

const em = 16

export default function SpaceRepro() {
  return (
    <Canvas camera={{ position: [0, 0, 10], fov: 50 }} style={{ height: "100vh", touchAction: "none" }}>
      <color attach="background" args={["#0a0a0a"]} />
      <OrbitControls enableRotate={false} enableZoom={false} enablePan={false} />
      <ambientLight intensity={1} />

      <Fullscreen flexDirection="column" padding={20} gap={10} backgroundColor="#0f0f0f" fontFamilies={{ inconsolata }}>
        <Container flexDirection="column" gap={10}>
          <Text fontSize={20} color="#ffffff">Space Reproduction Test</Text>

          {/* Test 1: Single text with trailing space */}
          <Container backgroundColor="#1a1a1a" padding={10}>
            <Text fontSize={em} color="#00ff00" whiteSpace="pre">Single text with trailing space:   </Text>
          </Container>

          {/* Test 2: Row with multiple text elements, some with trailing spaces */}
          <Container backgroundColor="#1a1a1a" padding={10} flexDirection="row">
            <Text fontSize={em} color="#ff0000" whiteSpace="pre">const </Text>
            <Text fontSize={em} color="#00ff00" whiteSpace="pre">foo </Text>
            <Text fontSize={em} color="#ffffff" whiteSpace="pre">= </Text>
            <Text fontSize={em} color="#ffff00" whiteSpace="pre">"bar"</Text>
          </Container>

          {/* Test 3: Row with text that should show multiple spaces between words */}
          <Container backgroundColor="#1a1a1a" padding={10} flexDirection="row">
            <Text fontSize={em} color="#ff0000" whiteSpace="pre">word1   </Text>
            <Text fontSize={em} color="#00ff00" whiteSpace="pre">word2</Text>
          </Container>

          {/* Test 4: Expected vs Actual */}
          <Container flexDirection="column" gap={5}>
            <Text fontSize={14} color="#888888">Expected: "const foo = bar" (with spaces between tokens)</Text>
            <Container backgroundColor="#2a2a2a" padding={5} flexDirection="row">
              <Text fontSize={em} color="#ffffff" whiteSpace="pre">const </Text>
              <Text fontSize={em} color="#ffffff" whiteSpace="pre">foo </Text>
              <Text fontSize={em} color="#ffffff" whiteSpace="pre">= </Text>
              <Text fontSize={em} color="#ffffff" whiteSpace="pre">bar</Text>
            </Container>
          </Container>
        </Container>
      </Fullscreen>
    </Canvas>
  )
}
