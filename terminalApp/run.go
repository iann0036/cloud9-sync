package main

import (
	"os"
	"net"
	"fmt"
	"golang.org/x/crypto/ssh/terminal"
)

func stdInReader(c chan string) {
    for {
		var bs = make([]byte, 1024)

		n, err := os.Stdin.Read(bs)
		if err != nil {
			os.Exit(1)
		}

        c <- string(bs[:n])
	}
}

func socketReader(sock net.Conn, c chan string) {
	for {
		var bs = make([]byte, 1024)

		n, err := sock.Read(bs)
		if err != nil {
			os.Exit(0)
		}

		c <- string(bs[:n])
	}
}

func main() {
	var socketCh chan string = make(chan string)
	var stdInCh chan string = make(chan string)

	fd := int(os.Stdout.Fd())
	origTerminalState, err := terminal.MakeRaw(fd)
	if err != nil {
		panic(err)
	}
	defer terminal.Restore(fd, origTerminalState)

	sock, err := net.Dial("tcp", os.Args[1])
	if err != nil {
		os.Exit(1)
	}

	go socketReader(sock, socketCh)
	go stdInReader(stdInCh)

	for {
		select {
		case socketInbountData := <- socketCh:
		  	fmt.Printf(socketInbountData)
		case stdInData := <- stdInCh:
			fmt.Fprintf(sock, stdInData)
		}
	}
}
